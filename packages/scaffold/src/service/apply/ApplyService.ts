import {
  type Apply,
  type ApplyFailedPath,
  ApplyFailure,
  ApplyResult,
} from "@repo/domain/Apply";
import type { Plan } from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
} from "effect";
import { StructuralMerger } from "./StructuralMerger";
import { type ApplyWriteRequest, WriteEngine } from "./WriteEngine";

type MaterializedPlannedOutcomeAction =
  | {
      readonly _tag: "skip";
      readonly path: string;
      readonly reason: "unchanged" | "decision";
    }
  | {
      readonly _tag: "write-authoritative";
      readonly path: string;
      readonly contents: string;
      readonly writeMode: "create" | "modify" | "override";
    }
  | {
      readonly _tag: "write-structural";
      readonly path: string;
      readonly requiredStructure: Extract<
        typeof Plan.fields.outcomes.schema.Type,
        { _tag: "partial" }
      >["requiredStructure"];
      readonly writeMode: "create" | "modify" | "override";
    }
  | {
      readonly _tag: "write-composed";
      readonly path: string;
      readonly contents: string;
      readonly requiredStructure: Extract<
        typeof Plan.fields.outcomes.schema.Type,
        { _tag: "partial" }
      >["requiredStructure"];
      readonly writeMode: "create" | "modify" | "override";
    };

type PreparedApplyAction =
  | {
      readonly _tag: "skip";
      readonly path: string;
    }
  | {
      readonly _tag: "write";
      readonly request: ApplyWriteRequest;
    };

export class ApplyService extends Context.Service<ApplyService>()(
  "ApplyService",
  {
    make: Effect.gen(function* () {
      const writeEngine = yield* WriteEngine;
      const merger = yield* StructuralMerger;
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
            (outcome): MaterializedPlannedOutcomeAction => {
              const decision = decisionsByPath.get(outcome.path);
              switch (outcome.classification) {
                case "unchanged":
                  return {
                    _tag: "skip",
                    path: outcome.path,
                    reason: "unchanged",
                  };
                case "create":
                case "modify":
                  if (outcome._tag === "complete") {
                    return {
                      _tag: "write-authoritative",
                      path: outcome.path,
                      contents: outcome.contents,
                      writeMode: outcome.classification,
                    };
                  }

                  if (outcome._tag === "composed") {
                    return {
                      _tag: "write-composed",
                      path: outcome.path,
                      contents: outcome.contents,
                      requiredStructure: outcome.requiredStructure,
                      writeMode: outcome.classification,
                    };
                  }

                  return {
                    _tag: "write-structural",
                    path: outcome.path,
                    requiredStructure: outcome.requiredStructure,
                    writeMode: outcome.classification,
                  };
                case "conflict":
                  if (decision === "skip") {
                    return {
                      _tag: "skip",
                      path: outcome.path,
                      reason: "decision",
                    };
                  }

                  if (outcome._tag === "complete") {
                    return {
                      _tag: "write-authoritative",
                      path: outcome.path,
                      contents: outcome.contents,
                      writeMode: "override",
                    };
                  }

                  if (outcome._tag === "composed") {
                    return {
                      _tag: "write-composed",
                      path: outcome.path,
                      contents: outcome.contents,
                      requiredStructure: outcome.requiredStructure,
                      writeMode: "override",
                    };
                  }

                  return {
                    _tag: "write-structural",
                    path: outcome.path,
                    requiredStructure: outcome.requiredStructure,
                    writeMode: "override",
                  };
              }
            },
          );
        },
      );

      const loadFileContents = Effect.fn("ApplyService.loadFileContents")(
        function* (path: string) {
          const pathStat = yield* fileSystem
            .stat(path)
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
              message: `Expected ${path} to be a file during apply.`,
            });
          }

          const contents = yield* fileSystem.readFileString(path).pipe(
            Effect.mapError(
              (error) =>
                new ApplyFailure({
                  reason: "repoRootInvalid",
                  message: `Could not read ${path} during apply: ${error.message}`,
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
        action: MaterializedPlannedOutcomeAction;
        repoRoot: string;
      }) {
        switch (action._tag) {
          case "skip":
            return {
              _tag: "skip",
              path: action.path,
            } satisfies PreparedApplyAction;
          case "write-authoritative":
            return {
              _tag: "write",
              request: {
                path: action.path,
                contents: action.contents,
                writeMode: action.writeMode,
              },
            } satisfies PreparedApplyAction;
          case "write-structural": {
            const existingContents = yield* loadFileContents(
              path.join(repoRoot, action.path),
            );
            const merged = yield* merger.merge({
              path: action.path,
              required: action.requiredStructure,
              existing: existingContents,
              mode: action.writeMode,
            });

            return {
              _tag: "write",
              request: {
                path: action.path,
                contents: merged.contents,
                writeMode: action.writeMode,
              },
            } satisfies PreparedApplyAction;
          }
          case "write-composed": {
            const merged = yield* merger.mergeComposed({
              path: action.path,
              baseContents: action.contents,
              required: action.requiredStructure,
            });

            return {
              _tag: "write",
              request: {
                path: action.path,
                contents: merged.contents,
                writeMode: action.writeMode,
              },
            } satisfies PreparedApplyAction;
          }
        }
      });

      const projection = Effect.fn("ApplyService.projection")(function* ({
        actions,
        repoRoot,
      }: {
        actions: ReadonlyArray<MaterializedPlannedOutcomeAction>;
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

        return Arr.reduce(
          preparedActions,
          {
            skippedPaths: new Set<string>(),
            writeRequests: [] as Array<ApplyWriteRequest>,
          },
          (projection, preparedAction) => {
            switch (preparedAction._tag) {
              case "skip":
                projection.skippedPaths.add(preparedAction.path);
                return projection;
              case "write":
                projection.writeRequests.push(preparedAction.request);
                return projection;
            }
          },
        );
      });

      const apply = Effect.fn("ApplyService.apply")(function* ({
        apply,
        repoRoot,
      }: {
        apply: typeof Apply.Type;
        repoRoot: string;
      }) {
        const actions = yield* materializeFrom(apply);

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
        const writeProjection = Arr.reduce(
          writeAttempts,
          {
            created: [] as Array<string>,
            modified: [] as Array<string>,
            skippedPaths: actionProjection.skippedPaths,
            failed: [] as Array<typeof ApplyFailedPath.Type>,
          },
          (projection, writeAttempt) => {
            switch (writeAttempt.status) {
              case "created":
                projection.created.push(writeAttempt.path);
                return projection;
              case "modified":
                projection.modified.push(writeAttempt.path);
                return projection;
              case "unchanged":
                projection.skippedPaths.add(writeAttempt.path);
                return projection;
              case "failure":
                projection.failed.push({
                  path: writeAttempt.path,
                  reason: writeAttempt.reason,
                });
                return projection;
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
    Layer.provide(StructuralMerger.layer),
  );
}
