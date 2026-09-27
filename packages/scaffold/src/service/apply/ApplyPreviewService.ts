import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import {
  Apply,
  ApplyFailure,
  ApplyResult,
  StalePlanFailure,
} from "@repo/domain/Apply";
import { pathOrd } from "@repo/domain/Order";
import { Plan } from "@repo/domain/Plan";
import { Array as Arr, Context, Effect, FileSystem, Layer, Path } from "effect";
import {
  type ApplyPreviewFile,
  ApplyPreviewFileSchema,
} from "../../RecipePreviewSchema";
import { RepositoryStateService } from "../plan/RepositoryStateService";
import { ApplyService } from "./ApplyService";

export type { ApplyPreviewFile };
export { ApplyPreviewFileSchema };

export type ApplyPreview = {
  readonly apply: ApplyResult;
  readonly files: ReadonlyArray<ApplyPreviewFile>;
};

export interface ApplyPreviewServiceShape {
  readonly preview: (input: {
    readonly apply: Apply;
    readonly repoRoot: string;
  }) => Effect.Effect<ApplyPreview, ApplyFailure | StalePlanFailure, never>;
}

export class ApplyPreviewService extends Context.Service<
  ApplyPreviewService,
  ApplyPreviewServiceShape
>()("ApplyPreviewService", {
  make: Effect.gen(function* () {
    const hostFileSystem = yield* FileSystem.FileSystem;
    const hostPath = yield* Path.Path;
    const virtualPath = yield* Path.Path.pipe(Effect.provide(Path.layer));
    const repositoryState = yield* RepositoryStateService;

    const preview = Effect.fn("ApplyPreviewService.preview")(function* ({
      apply,
      repoRoot,
    }: {
      readonly apply: Apply;
      readonly repoRoot: string;
    }) {
      const initialChanges = yield* repositoryState.verify({
        baseline: apply.plan.baseline,
        repoRoot,
      });
      if (initialChanges.length > 0) {
        return yield* new StalePlanFailure({
          changes: initialChanges,
          partialResult: new ApplyResult({
            created: [],
            modified: [],
            skipped: [],
            failed: [],
          }),
          message: `Repository changed since planning: ${initialChanges.map((change) => `${change.path} (${change.kind})`).join(", ")}. Replan and try again.`,
        });
      }
      const memoryFileSystem = yield* MemoryFileSystem.make.pipe(
        Effect.provide(BrowserCrypto.layer),
      );
      const workspaceRoot = "/workspace";
      yield* memoryFileSystem
        .makeDirectory(workspaceRoot, { recursive: true })
        .pipe(
          Effect.mapError(
            (error) =>
              new ApplyFailure({
                reason: "executionFailure",
                message: `Could not initialize apply preview: ${error.message}`,
              }),
          ),
        );
      const baselinePaths = Arr.map(
        apply.plan.baseline.paths,
        (entry) => entry.path,
      );

      yield* Effect.forEach(
        baselinePaths,
        (relativePath) =>
          Effect.gen(function* () {
            const sourcePath = hostPath.join(repoRoot, relativePath);
            const memoryPath = virtualPath.join(workspaceRoot, relativePath);

            const stat = yield* hostFileSystem.stat(sourcePath).pipe(
              Effect.catch((error) =>
                error.reason._tag === "NotFound"
                  ? Effect.succeed(null)
                  : Effect.fail(
                      new ApplyFailure({
                        reason: "repoRootInvalid",
                        message: `Could not inspect ${sourcePath} during apply preview: ${error.message}`,
                      }),
                    ),
              ),
            );

            if (stat === null) {
              return;
            }

            if (stat.type === "Directory") {
              yield* memoryFileSystem
                .makeDirectory(memoryPath, { recursive: true })
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new ApplyFailure({
                        reason: "executionFailure",
                        message: `Could not seed ${relativePath} during apply preview: ${error.message}`,
                      }),
                  ),
                );
              return;
            }

            const contents = yield* hostFileSystem.readFile(sourcePath).pipe(
              Effect.mapError(
                (error) =>
                  new ApplyFailure({
                    reason: "repoRootInvalid",
                    message: `Could not read ${sourcePath} during apply preview: ${error.message}`,
                  }),
              ),
            );
            yield* memoryFileSystem
              .makeDirectory(virtualPath.dirname(memoryPath), {
                recursive: true,
              })
              .pipe(
                Effect.andThen(
                  memoryFileSystem.writeFile(memoryPath, contents),
                ),
                Effect.mapError(
                  (error) =>
                    new ApplyFailure({
                      reason: "executionFailure",
                      message: `Could not seed ${relativePath} during apply preview: ${error.message}`,
                    }),
                ),
              );
          }),
        { concurrency: 1, discard: true },
      );

      const finalChanges = yield* repositoryState.verify({
        baseline: apply.plan.baseline,
        repoRoot,
      });
      if (finalChanges.length > 0) {
        return yield* new StalePlanFailure({
          changes: finalChanges,
          partialResult: new ApplyResult({
            created: [],
            modified: [],
            skipped: [],
            failed: [],
          }),
          message: `Repository changed since planning: ${finalChanges.map((change) => `${change.path} (${change.kind})`).join(", ")}. Replan and try again.`,
        });
      }

      const memoryLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, memoryFileSystem),
        Layer.succeed(Path.Path, virtualPath),
      );
      const applyLayer = Layer.fresh(ApplyService.layer).pipe(
        Layer.provide(memoryLayer),
      );
      const previewApply = new Apply({
        plan: new Plan({
          baseline: {
            root: workspaceRoot,
            paths: Arr.map(apply.plan.baseline.paths, (entry) =>
              entry.path === "." && entry._tag === "missing"
                ? { _tag: "directory" as const, path: entry.path }
                : entry,
            ),
          },
          outcomes: [...apply.plan.outcomes],
          conflicts: [...apply.plan.conflicts],
        }),
        decisions: [...apply.decisions],
      });
      const result = yield* Effect.gen(function* () {
        const applyService = yield* ApplyService;
        return yield* applyService.apply({
          apply: previewApply,
          repoRoot: workspaceRoot,
        });
      }).pipe(Effect.provide(applyLayer));

      const successfulPaths = Arr.sort(
        [
          ...Arr.map(result.created, (filePath) => ({
            path: filePath,
            status: "created" as const,
          })),
          ...Arr.map(result.modified, (filePath) => ({
            path: filePath,
            status: "modified" as const,
          })),
        ],
        pathOrd,
      );

      const files = yield* Effect.forEach(
        successfulPaths,
        ({ path: filePath, status }) =>
          memoryFileSystem
            .readFileString(virtualPath.join(workspaceRoot, filePath))
            .pipe(
              Effect.map((contents) => ({
                path: filePath,
                status,
                contents,
              })),
              Effect.mapError(
                (error) =>
                  new ApplyFailure({
                    reason: "executionFailure",
                    message: `Could not read ${filePath} after apply preview: ${error.message}`,
                  }),
              ),
            ),
      );

      return { apply: result, files } satisfies ApplyPreview;
    });

    return { preview } satisfies ApplyPreviewServiceShape;
  }),
}) {
  static readonly layer = Layer.effect(ApplyPreviewService)(
    ApplyPreviewService.make,
  ).pipe(Layer.provide(RepositoryStateService.layer));
}
