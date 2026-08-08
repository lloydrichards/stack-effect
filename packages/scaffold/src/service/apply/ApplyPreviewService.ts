import { type Apply, ApplyFailure, type ApplyResult } from "@repo/domain/Apply";
import { pathOrd } from "@repo/domain/Order";
import { Array as Arr, Context, Effect, FileSystem, Layer, Path } from "effect";
import * as MemoryFileSystem from "../../MemoryFileSystem";
import {
  type ApplyPreviewFile,
  ApplyPreviewFileSchema,
} from "../../RecipePreviewSchema";
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
  }) => Effect.Effect<ApplyPreview, ApplyFailure, never>;
}

export class ApplyPreviewService extends Context.Service<
  ApplyPreviewService,
  ApplyPreviewServiceShape
>()("ApplyPreviewService", {
  make: Effect.gen(function* () {
    const hostFileSystem = yield* FileSystem.FileSystem;
    const hostPath = yield* Path.Path;
    const virtualPath = yield* Path.Path.pipe(Effect.provide(Path.layer));

    const preview = Effect.fn("ApplyPreviewService.preview")(function* ({
      apply,
      repoRoot,
    }: {
      readonly apply: Apply;
      readonly repoRoot: string;
    }) {
      const memoryFileSystem = yield* MemoryFileSystem.make;
      const workspaceRoot = "/workspace";
      const decisions = new Map(
        Arr.map(apply.decisions, (decision) => [decision.path, decision.value]),
      );
      const relevantPaths = Arr.map(
        Arr.filter(
          apply.plan.outcomes,
          (outcome) =>
            outcome.classification !== "unchanged" &&
            !(
              outcome.classification === "conflict" &&
              decisions.get(outcome.path) === "skip"
            ),
        ),
        (outcome) => outcome.path,
      );

      yield* Effect.forEach(
        relevantPaths,
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

            const contents = yield* hostFileSystem
              .readFileString(sourcePath)
              .pipe(
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
                  memoryFileSystem.writeFileString(memoryPath, contents),
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

      const memoryLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, memoryFileSystem),
        Layer.succeed(Path.Path, virtualPath),
      );
      const applyLayer = Layer.fresh(ApplyService.layer).pipe(
        Layer.provide(memoryLayer),
      );
      const result = yield* Effect.gen(function* () {
        const applyService = yield* ApplyService;
        return yield* applyService.apply({ apply, repoRoot: workspaceRoot });
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
  );
}
