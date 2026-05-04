import {
  type Apply,
  type ApplyFailedPath,
  ApplyFailure,
  ApplyResult,
} from "@repo/domain/Apply";
import type { CompositionOperations, Plan } from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
} from "effect";
import { CompositionEngine } from "./CompositionEngine";
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
      readonly _tag: "write-composed";
      readonly path: string;
      readonly seedContents: string | undefined;
      readonly operations: ReadonlyArray<typeof CompositionOperation.Type>;
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
            (outcome): MaterializedPlannedOutcomeAction =>
              Match.value(outcome).pipe(
                Match.withReturnType<MaterializedPlannedOutcomeAction>(),
                Match.when({ classification: "unchanged" }, (o) => ({
                  _tag: "skip" as const,
                  path: o.path,
                  reason: o.classification,
                })),
                Match.whenOr(
                  { classification: "create" },
                  { classification: "modify" },
                  (o) =>
                    Match.valueTags(o, {
                      complete: (n) => ({
                        _tag: "write-authoritative" as const,
                        path: n.path,
                        contents: n.contents,
                        writeMode: n.classification,
                      }),
                      composed: (n) => ({
                        _tag: "write-composed" as const,
                        path: n.path,
                        seedContents: n.seedContents,
                        operations: n.operations,
                        writeMode: n.classification,
                      }),
                    }),
                ),
                Match.when({ classification: "conflict" }, (o) => {
                  if (decisionsByPath.get(outcome.path) === "skip") {
                    return {
                      _tag: "skip" as const,
                      path: o.path,
                      reason: "decision" as const,
                    };
                  }
                  return Match.valueTags(o, {
                    complete: (n) => ({
                      _tag: "write-authoritative" as const,
                      path: n.path,
                      contents: n.contents,
                      writeMode: "override" as const,
                    }),
                    composed: (n) => ({
                      _tag: "write-composed" as const,
                      path: n.path,
                      seedContents: n.seedContents,
                      operations: n.operations,
                      writeMode: "override" as const,
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
          case "write-composed": {
            // Get base contents: use seedContents if provided, otherwise load from file
            let baseContents: string;
            if (action.seedContents !== undefined) {
              baseContents = action.seedContents;
            } else {
              const existingContents = yield* loadFileContents(
                path.join(repoRoot, action.path),
              );
              if (Option.isNone(existingContents)) {
                // No existing file and no seed - start with empty for JSON, fail for TS
                if (action.path.endsWith(".json")) {
                  baseContents = "{}";
                } else {
                  baseContents = "";
                }
              } else {
                baseContents = existingContents.value;
              }
            }

            // Apply composition operations
            const composedContents = yield* compositionEngine.compose(
              action.path,
              baseContents,
              action.operations,
            );

            return {
              _tag: "write",
              request: {
                path: action.path,
                contents: composedContents,
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
        const writeProjection = Arr.reduce(
          writeAttempts,
          {
            created: [] as Array<string>,
            modified: [] as Array<string>,
            skippedPaths: actionProjection.skippedPaths,
            failed: [] as Array<typeof ApplyFailedPath.Type>,
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
