import {
  type Apply,
  type ApplyFailedPath,
  ApplyFailure,
  ApplyResult,
} from "@repo/domain/Apply";
import { CompositionOperation } from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Schema,
} from "effect";
import { CompositionEngine } from "./CompositionEngine";
import { type ApplyWriteRequest, WriteEngine } from "./WriteEngine";

const MaterializedPlannedOutcomeAction = Schema.TaggedUnion({
  skip: {
    path: Schema.String,
    reason: Schema.Literals(["unchanged", "decision"]),
  },
  "write-authoritative": {
    path: Schema.String,
    contents: Schema.String,
    writeMode: Schema.Literals(["create", "modify", "override"]),
  },
  "write-composed": {
    path: Schema.String,
    seedContents: Schema.Union([Schema.String, Schema.Undefined]),
    operations: Schema.Array(CompositionOperation),
    writeMode: Schema.Literals(["create", "modify", "override"]),
  },
});

type WriteComposedAction = Extract<
  typeof MaterializedPlannedOutcomeAction.Type,
  { readonly _tag: "write-composed" }
>;

const PreparedApplyAction = Schema.TaggedUnion({
  skip: {
    path: Schema.String,
  },
  write: {
    request: Schema.Struct({
      path: Schema.String,
      contents: Schema.String,
      writeMode: Schema.Literals(["create", "modify", "override"]),
    }),
  },
});

type ActionProjection = {
  readonly skippedPaths: Set<string>;
  readonly writeRequests: Array<ApplyWriteRequest>;
};

type WriteAttempt =
  | {
      readonly path: string;
      readonly status: "created" | "modified" | "unchanged";
    }
  | {
      readonly path: string;
      readonly status: "failure";
      readonly reason: string;
    };

export interface ApplyServiceShape {
  readonly apply: (input: {
    readonly apply: typeof Apply.Type;
    readonly repoRoot: string;
  }) => Effect.Effect<ApplyResult, ApplyFailure, never>;
  readonly preview: (input: {
    readonly apply: typeof Apply.Type;
    readonly repoRoot: string;
  }) => Effect.Effect<ApplyResult, ApplyFailure, never>;
}

export class ApplyService extends Context.Service<
  ApplyService,
  ApplyServiceShape
>()("ApplyService", {
  make: Effect.gen(function* () {
    const writeEngine = yield* WriteEngine;
    const compositionEngine = yield* CompositionEngine;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const validateApplyIntent = Effect.fn("ApplyService.validateApplyIntent")(
      function* (apply: typeof Apply.Type) {
        const conflictPaths = new Set(
          Arr.map(
            Arr.filter(
              apply.plan.outcomes,
              (outcome) => outcome.classification === "conflict",
            ),
            (outcome) => outcome.path,
          ),
        );

        const seenDecisionPaths = new Set<string>();
        const duplicateDecision = Arr.findFirst(apply.decisions, (decision) => {
          if (seenDecisionPaths.has(decision.path)) {
            return true;
          }
          seenDecisionPaths.add(decision.path);
          return false;
        });
        if (Option.isSome(duplicateDecision)) {
          return yield* new ApplyFailure({
            reason: "invalidApplyIntent",
            message: `Duplicate apply decision for ${duplicateDecision.value.path}.`,
          });
        }

        const extraDecision = Arr.findFirst(
          apply.decisions,
          (decision) => !conflictPaths.has(decision.path),
        );
        if (Option.isSome(extraDecision)) {
          return yield* new ApplyFailure({
            reason: "invalidApplyIntent",
            message: `Unexpected apply decision for non-conflicted path ${extraDecision.value.path}.`,
          });
        }

        const decisionPaths = new Set(
          Arr.map(apply.decisions, (decision) => decision.path),
        );
        const missingDecisionPath = Arr.findFirst(
          [...conflictPaths],
          (conflictPath) => !decisionPaths.has(conflictPath),
        );
        if (Option.isSome(missingDecisionPath)) {
          return yield* new ApplyFailure({
            reason: "invalidApplyIntent",
            message: `Missing apply decision for conflicted path ${missingDecisionPath.value}.`,
          });
        }
      },
    );

    const materializeFrom = Effect.fn("ApplyService.materializeFrom")(
      function* (apply: typeof Apply.Type) {
        yield* validateApplyIntent(apply);

        const decisionsByPath = new Map(
          apply.decisions.map(
            (decision) => [decision.path, decision.value] as const,
          ),
        );
        return Arr.map(
          apply.plan.outcomes,
          (outcome): typeof MaterializedPlannedOutcomeAction.Type =>
            Match.value(outcome).pipe(
              Match.withReturnType<
                typeof MaterializedPlannedOutcomeAction.Type
              >(),
              Match.when({ classification: "unchanged" }, (o) =>
                MaterializedPlannedOutcomeAction.cases.skip.make({
                  path: o.path,
                  reason: o.classification,
                }),
              ),
              Match.whenOr(
                { classification: "create" },
                { classification: "modify" },
                (o) =>
                  Match.valueTags(o, {
                    complete: (n) =>
                      MaterializedPlannedOutcomeAction.cases[
                        "write-authoritative"
                      ].make({
                        path: n.path,
                        contents: n.contents,
                        writeMode: n.classification,
                      }),
                    composed: (n) =>
                      MaterializedPlannedOutcomeAction.cases[
                        "write-composed"
                      ].make({
                        path: n.path,
                        seedContents: n.seedContents,
                        operations: n.operations,
                        writeMode: n.classification,
                      }),
                  }),
              ),
              Match.when({ classification: "conflict" }, (o) => {
                if (decisionsByPath.get(outcome.path) === "skip") {
                  return MaterializedPlannedOutcomeAction.cases.skip.make({
                    path: o.path,
                    reason: "decision",
                  });
                }
                return Match.valueTags(o, {
                  complete: (n) =>
                    MaterializedPlannedOutcomeAction.cases[
                      "write-authoritative"
                    ].make({
                      path: n.path,
                      contents: n.contents,
                      writeMode: "override",
                    }),
                  composed: (n) =>
                    MaterializedPlannedOutcomeAction.cases[
                      "write-composed"
                    ].make({
                      path: n.path,
                      seedContents: n.seedContents,
                      operations: n.operations,
                      writeMode: "override",
                    }),
                });
              }),
              Match.exhaustive,
            ),
        );
      },
    );

    const loadFileContents = Effect.fn("ApplyService.loadFileContents")(
      function* (filePath: string) {
        const pathStat = yield* fileSystem.stat(filePath).pipe(
          Effect.catch((error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(null)
              : Effect.fail(
                  new ApplyFailure({
                    reason: "repoRootInvalid",
                    message: `Could not inspect ${filePath} during apply: ${error.message}`,
                  }),
                ),
          ),
        );

        if (pathStat === null) {
          return Option.none<string>();
        }

        if (pathStat.type === "Directory") {
          return yield* new ApplyFailure({
            reason: "repoRootInvalid",
            message: `Expected ${filePath} to be a file during apply.`,
          });
        }

        const contents = yield* fileSystem.readFileString(filePath).pipe(
          Effect.mapError(
            (error) =>
              new ApplyFailure({
                reason: "repoRootInvalid",
                message: `Could not read ${filePath} during apply: ${error.message}`,
              }),
          ),
        );

        return Option.some(contents);
      },
    );

    const loadComposedBaseContents = Effect.fn(
      "ApplyService.loadComposedBaseContents",
    )(function* ({
      action,
      repoRoot,
    }: {
      action: WriteComposedAction;
      repoRoot: string;
    }) {
      const fullPath = path.join(repoRoot, action.path);
      const existingContents =
        action.writeMode === "modify"
          ? yield* loadFileContents(fullPath)
          : Option.none<string>();

      if (Option.isSome(existingContents)) {
        return existingContents.value;
      }

      if (action.seedContents !== undefined) {
        return action.seedContents;
      }

      const fallbackContents = yield* loadFileContents(fullPath);
      return Option.getOrElse(fallbackContents, () =>
        action.path.endsWith(".json") ? "{}" : "",
      );
    });

    const prepare = Effect.fn("ApplyService.prepare")(function* ({
      action,
      repoRoot,
    }: {
      action: typeof MaterializedPlannedOutcomeAction.Type;
      repoRoot: string;
    }) {
      switch (action._tag) {
        case "skip":
          return PreparedApplyAction.cases.skip.make({
            path: action.path,
          });
        case "write-authoritative":
          return PreparedApplyAction.cases.write.make({
            request: {
              path: action.path,
              contents: action.contents,
              writeMode: action.writeMode,
            },
          });
        case "write-composed": {
          // NOTE: Modify composes from disk first so repeat applies preserve unrelated fields.
          const baseContents = yield* loadComposedBaseContents({
            action,
            repoRoot,
          });
          const composedContents = yield* compositionEngine.compose(
            action.path,
            baseContents,
            action.operations,
          );

          return PreparedApplyAction.cases.write.make({
            request: {
              path: action.path,
              contents: composedContents,
              writeMode: action.writeMode,
            },
          });
        }
      }
    });

    const prepareWrites = Effect.fn("ApplyService.prepareWrites")(function* ({
      actions,
      repoRoot,
    }: {
      actions: ReadonlyArray<typeof MaterializedPlannedOutcomeAction.Type>;
      repoRoot: string;
    }) {
      const preparedActions = yield* Effect.all(
        Arr.map(actions, (action) =>
          prepare({
            action,
            repoRoot,
          }),
        ),
        {
          concurrency: 1,
        },
      );

      return Arr.reduce<typeof PreparedApplyAction.Type, ActionProjection>(
        preparedActions,
        {
          skippedPaths: new Set<string>(),
          writeRequests: [],
        },
        (projectionBuilder, preparedAction) => {
          switch (preparedAction._tag) {
            case "skip":
              projectionBuilder.skippedPaths.add(preparedAction.path);
              return projectionBuilder;
            case "write":
              projectionBuilder.writeRequests.push(preparedAction.request);
              return projectionBuilder;
          }
        },
      );
    });

    const executeWrites = Effect.fn("ApplyService.executeWrites")(function* ({
      repoRoot,
      writeRequests,
    }: {
      repoRoot: string;
      writeRequests: ReadonlyArray<ApplyWriteRequest>;
    }) {
      return yield* Effect.all(
        Arr.map(writeRequests, (writeRequest) =>
          writeEngine.write({ repoRoot, write: writeRequest }).pipe(
            Effect.catch((error) =>
              Effect.succeed({
                path: writeRequest.path,
                status: "failure" as const,
                reason: error.message,
              }),
            ),
          ),
        ),
        {
          concurrency: 1,
        },
      );
    });

    const toApplyResult = ({
      skippedPaths,
      writeAttempts,
    }: {
      skippedPaths: ReadonlySet<string>;
      writeAttempts: ReadonlyArray<WriteAttempt>;
    }) => {
      const resultBuilder = Arr.reduce<
        WriteAttempt,
        {
          created: Array<string>;
          modified: Array<string>;
          skippedPaths: Set<string>;
          failed: Array<typeof ApplyFailedPath.Type>;
        }
      >(
        writeAttempts,
        {
          created: [],
          modified: [],
          skippedPaths: new Set(skippedPaths),
          failed: [],
        },
        (builder, writeAttempt) => {
          switch (writeAttempt.status) {
            case "created":
              builder.created.push(writeAttempt.path);
              return builder;
            case "modified":
              builder.modified.push(writeAttempt.path);
              return builder;
            case "unchanged":
              builder.skippedPaths.add(writeAttempt.path);
              return builder;
            case "failure":
              builder.failed.push({
                path: writeAttempt.path,
                reason: writeAttempt.reason,
              });
              return builder;
          }
        },
      );

      return new ApplyResult({
        created: resultBuilder.created,
        modified: resultBuilder.modified,
        skipped: [...resultBuilder.skippedPaths],
        failed: resultBuilder.failed,
      }).toSorted();
    };

    const apply = Effect.fn("ApplyService.apply")(function* ({
      apply: applyIntent,
      repoRoot,
    }: {
      apply: typeof Apply.Type;
      repoRoot: string;
    }) {
      const actions = yield* materializeFrom(applyIntent);

      const actionProjection = yield* prepareWrites({ actions, repoRoot });

      const writeAttempts = yield* executeWrites({
        repoRoot,
        writeRequests: actionProjection.writeRequests,
      });

      return toApplyResult({
        skippedPaths: actionProjection.skippedPaths,
        writeAttempts,
      });
    });

    const preview = Effect.fn("ApplyService.preview")(function* ({
      apply: applyIntent,
      repoRoot,
    }: {
      apply: typeof Apply.Type;
      repoRoot: string;
    }) {
      const actions = yield* materializeFrom(applyIntent);
      const actionProjection = yield* prepareWrites({ actions, repoRoot });

      return toApplyResult({
        skippedPaths: actionProjection.skippedPaths,
        writeAttempts: Arr.map(actionProjection.writeRequests, (request) => ({
          path: request.path,
          status: request.writeMode === "create" ? "created" : "modified",
        })),
      });
    });

    return { apply, preview } satisfies ApplyServiceShape;
  }),
}) {
  static readonly layer = Layer.effect(ApplyService)(ApplyService.make).pipe(
    Layer.provide(WriteEngine.layer),
    Layer.provide(CompositionEngine.layer),
  );
}
