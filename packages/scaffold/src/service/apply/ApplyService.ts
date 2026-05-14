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

export class ApplyService extends Context.Service<ApplyService>()(
  "ApplyService",
  {
    make: Effect.gen(function* () {
      const writeEngine = yield* WriteEngine;
      const compositionEngine = yield* CompositionEngine;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const materializeFrom = Effect.fn("ApplyService.materializeFrom")(
        function* (apply: typeof Apply.Type) {
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
          const pathStat = yield* fileSystem
            .stat(filePath)
            .pipe(
              Effect.catch((error) =>
                error.reason._tag === "NotFound"
                  ? Effect.succeed(null)
                  : Effect.fail(error),
              ),
            );

          if (pathStat === null) {
            return Option.none<string>();
          }

          if (pathStat.type === "Directory") {
            throw new ApplyFailure({
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
            // Get base contents:
            // For "modify" mode, always prefer the existing file so we don't
            // overwrite fields added by prior apply runs. Fall back to
            // seedContents (used for "create") or a sensible default.
            let baseContents: string;
            const existingContents =
              action.writeMode === "modify"
                ? yield* loadFileContents(path.join(repoRoot, action.path))
                : Option.none<string>();

            if (Option.isSome(existingContents)) {
              baseContents = existingContents.value;
            } else if (action.seedContents !== undefined) {
              baseContents = action.seedContents;
            } else {
              const fallbackContents = yield* loadFileContents(
                path.join(repoRoot, action.path),
              );
              if (Option.isNone(fallbackContents)) {
                // No existing file and no seed - start with empty for JSON, fail for TS
                if (action.path.endsWith(".json")) {
                  baseContents = "{}";
                } else {
                  baseContents = "";
                }
              } else {
                baseContents = fallbackContents.value;
              }
            }

            // Apply composition operations
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

      const projection = Effect.fn("ApplyService.projection")(function* ({
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

        return Arr.reduce<
          typeof PreparedApplyAction.Type,
          {
            skippedPaths: Set<string>;
            writeRequests: Array<ApplyWriteRequest>;
          }
        >(
          preparedActions,
          {
            skippedPaths: new Set<string>(),
            writeRequests: [],
          },
          (proj, preparedAction) => {
            switch (preparedAction._tag) {
              case "skip":
                proj.skippedPaths.add(preparedAction.path);
                return proj;
              case "write":
                proj.writeRequests.push(preparedAction.request);
                return proj;
            }
          },
        );
      });

      const apply = Effect.fn("ApplyService.apply")(function* ({
        apply: applyIntent,
        repoRoot,
      }: {
        apply: typeof Apply.Type;
        repoRoot: string;
      }) {
        const actions = yield* materializeFrom(applyIntent);

        const actionProjection = yield* projection({ actions, repoRoot });

        const writeAttempts = yield* Effect.all(
          Arr.map(actionProjection.writeRequests, (writeRequest) =>
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
        const writeProjection = Arr.reduce<
          (typeof writeAttempts)[number],
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
            skippedPaths: actionProjection.skippedPaths,
            failed: [],
          },
          (proj, writeAttempt) => {
            switch (writeAttempt.status) {
              case "created":
                proj.created.push(writeAttempt.path);
                return proj;
              case "modified":
                proj.modified.push(writeAttempt.path);
                return proj;
              case "unchanged":
                proj.skippedPaths.add(writeAttempt.path);
                return proj;
              case "failure":
                proj.failed.push({
                  path: writeAttempt.path,
                  reason: writeAttempt.reason,
                });
                return proj;
            }
          },
        );

        return new ApplyResult({
          created: writeProjection.created,
          modified: writeProjection.modified,
          skipped: [...writeProjection.skippedPaths],
          failed: writeProjection.failed,
        }).toSorted();
      });

      return { apply } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(ApplyService)(ApplyService.make).pipe(
    Layer.provide(WriteEngine.layer),
    Layer.provide(CompositionEngine.layer),
  );
}
