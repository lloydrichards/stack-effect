import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import {
  Apply,
  ApplyFailure,
  ApplyResult,
  StalePlanFailure,
} from "@repo/domain/Apply";
import type { Blueprint } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import { pathOrd } from "@repo/domain/Order";
import { Plan, type PlanBaseline, type PlanFailure } from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/Scaffold";
import { Array as Arr, Context, Effect, FileSystem, Layer, Path } from "effect";
import type { ApplyPreviewFile } from "../../RecipePreviewSchema";
import { PlanService } from "../plan/PlanService";
import {
  RepositoryStateService,
  type RepositoryChange,
} from "../plan/RepositoryStateService";
import { ApplyService } from "./ApplyService";

const workspaceRoot = "/workspace";

export type MaterializedApply = {
  readonly apply: ApplyResult;
  readonly files: ReadonlyArray<ApplyPreviewFile>;
};

export interface ApplyWorkspace {
  readonly plan: (input: {
    readonly blueprint: typeof Blueprint.Type;
    readonly config: typeof StackConfig.Type;
  }) => Effect.Effect<typeof Plan.Type, PlanFailure | CatalogNotFound>;
  readonly materialize: (
    apply: Apply,
  ) => Effect.Effect<MaterializedApply, ApplyFailure | StalePlanFailure>;
}

export interface ApplyWorkspaceServiceShape {
  readonly create: (input?: {
    readonly repoRoot: string;
    readonly baseline: typeof PlanBaseline.Type;
  }) => Effect.Effect<ApplyWorkspace, ApplyFailure | StalePlanFailure>;
}

export class ApplyWorkspaceService extends Context.Service<
  ApplyWorkspaceService,
  ApplyWorkspaceServiceShape
>()("ApplyWorkspaceService") {
  static readonly make = Effect.gen(function* () {
    const hostFileSystem = yield* FileSystem.FileSystem;
    const hostPath = yield* Path.Path;
    const virtualPath = yield* Path.Path.pipe(Effect.provide(Path.layer));
    const repositoryState = yield* RepositoryStateService;

    const create: ApplyWorkspaceServiceShape["create"] = Effect.fn(
      "ApplyWorkspaceService.create",
    )(function* (input) {
      const stale = (changes: ReadonlyArray<RepositoryChange>) =>
        new StalePlanFailure({
          changes,
          partialResult: new ApplyResult({
            created: [],
            modified: [],
            skipped: [],
            failed: [],
          }),
          message: `Repository changed since planning: ${changes.map((change) => `${change.path} (${change.kind})`).join(", ")}. Replan and try again.`,
        });
      if (input !== undefined) {
        const changes = yield* repositoryState.verify(input);
        if (changes.length > 0) return yield* stale(changes);
      }

      const fileSystem = yield* MemoryFileSystem.make.pipe(
        Effect.provide(BrowserCrypto.layer),
      );
      yield* fileSystem.makeDirectory(workspaceRoot, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new ApplyFailure({
              reason: "executionFailure",
              message: `Could not initialize the workspace: ${error.message}`,
            }),
        ),
      );

      if (input !== undefined) {
        yield* Effect.forEach(
          input.baseline.paths,
          (entry) =>
            Effect.gen(function* () {
              if (entry._tag === "missing") return;
              const sourcePath = hostPath.join(input.repoRoot, entry.path);
              const targetPath = virtualPath.join(workspaceRoot, entry.path);
              if (entry._tag === "directory") {
                yield* fileSystem
                  .makeDirectory(targetPath, { recursive: true })
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new ApplyFailure({
                          reason: "executionFailure",
                          message: `Could not seed ${entry.path}: ${error.message}`,
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
                      message: `Could not read ${sourcePath}: ${error.message}`,
                    }),
                ),
              );
              yield* fileSystem
                .makeDirectory(virtualPath.dirname(targetPath), {
                  recursive: true,
                })
                .pipe(
                  Effect.andThen(fileSystem.writeFile(targetPath, contents)),
                  Effect.mapError(
                    (error) =>
                      new ApplyFailure({
                        reason: "executionFailure",
                        message: `Could not seed ${entry.path}: ${error.message}`,
                      }),
                  ),
                );
            }),
          { concurrency: 1, discard: true },
        );
        const changes = yield* repositoryState.verify(input);
        if (changes.length > 0) return yield* stale(changes);
      }

      const fileSystemLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fileSystem),
        Layer.succeed(Path.Path, virtualPath),
      );
      const plan = Effect.fn("ApplyWorkspace.plan")(function* ({
        blueprint,
        config,
      }: Parameters<ApplyWorkspace["plan"]>[0]) {
        const service = yield* PlanService;
        return yield* service.build({
          blueprint,
          config,
          repoRoot: workspaceRoot,
        });
      });

      const materialize: ApplyWorkspace["materialize"] = Effect.fn(
        "ApplyWorkspace.materialize",
      )(function* (apply) {
        if (
          apply.plan.baseline.root !== (input?.baseline.root ?? workspaceRoot)
        ) {
          return yield* stale([{ path: ".", kind: "rootChanged" }]);
        }
        const workspaceApply = new Apply({
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
          const service = yield* ApplyService;
          return yield* service.apply({
            apply: workspaceApply,
            repoRoot: workspaceRoot,
          });
        }).pipe(
          Effect.provide(
            Layer.fresh(ApplyService.layer).pipe(
              Layer.provide(fileSystemLayer),
            ),
          ),
        );
        const successfulPaths = Arr.sort(
          [
            ...Arr.map(result.created, (path) => ({
              path,
              status: "created" as const,
            })),
            ...Arr.map(result.modified, (path) => ({
              path,
              status: "modified" as const,
            })),
          ],
          pathOrd,
        );
        const files = yield* Effect.forEach(
          successfulPaths,
          ({ path, status }) =>
            fileSystem
              .readFileString(virtualPath.join(workspaceRoot, path))
              .pipe(
                Effect.map((contents) => ({ path, status, contents })),
                Effect.mapError(
                  (error) =>
                    new ApplyFailure({
                      reason: "executionFailure",
                      message: `Could not read ${path} after Apply: ${error.message}`,
                    }),
                ),
              ),
        );
        return { apply: result, files } satisfies MaterializedApply;
      });

      return {
        plan: (input) =>
          plan(input).pipe(
            Effect.provide(
              Layer.fresh(PlanService.layer).pipe(
                Layer.provide(fileSystemLayer),
              ),
            ),
          ),
        materialize,
      } satisfies ApplyWorkspace;
    });
    return { create } satisfies ApplyWorkspaceServiceShape;
  });

  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(RepositoryStateService.layer),
  );
}
