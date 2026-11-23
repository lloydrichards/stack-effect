import { MemoryFileSystem } from "@effect-vfs/memory";
import { CatalogService } from "@repo/catalog";
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
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import { PlanService } from "../plan/PlanService";
import * as RepositoryState from "../plan/RepositoryState";
import { ApplyService } from "./ApplyService";

const workspaceRoot = "/workspace";

export type MaterializedFile = {
  readonly path: string;
  readonly status: "created" | "modified";
  readonly contents: string;
};

export type MaterializedApply = {
  readonly apply: ApplyResult;
  readonly files: ReadonlyArray<MaterializedFile>;
};

export type ApplyWorkspace = {
  readonly plan: (input: {
    readonly blueprint: typeof Blueprint.Type;
    readonly config: typeof StackConfig.Type;
  }) => Effect.Effect<typeof Plan.Type, PlanFailure | CatalogNotFound>;
  readonly materialize: (
    apply: Apply,
  ) => Effect.Effect<MaterializedApply, ApplyFailure | StalePlanFailure>;
};

export type ApplyWorkspaceServiceShape = {
  /** Opens a workspace with no repository files, for plans built inside it. */
  readonly empty: () => Effect.Effect<ApplyWorkspace, ApplyFailure>;
  /** Opens a workspace seeded with the repository paths a host Plan captured. */
  readonly fromRepository: (input: {
    readonly repoRoot: string;
    readonly baseline: typeof PlanBaseline.Type;
  }) => Effect.Effect<ApplyWorkspace, ApplyFailure | StalePlanFailure>;
};

export class ApplyWorkspaceService extends Context.Service<
  ApplyWorkspaceService,
  ApplyWorkspaceServiceShape
>()("ApplyWorkspaceService") {
  static readonly make = Effect.gen(function* () {
    const hostFileSystem = yield* FileSystem.FileSystem;
    const hostPath = yield* Path.Path;
    const virtualPath = yield* Path.Path.pipe(Effect.provide(Path.layer));
    const repositoryState = yield* RepositoryState.RepositoryState;
    const digest = yield* Digest.Digest;
    const secureRandom = yield* SecureRandom.SecureRandom;
    const catalog = yield* CatalogService;

    const stale = (changes: ReadonlyArray<RepositoryState.RepositoryChange>) =>
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

    const verify = Effect.fnUntraced(function* (input: {
      readonly repoRoot: string;
      readonly baseline: typeof PlanBaseline.Type;
    }) {
      const changes = yield* repositoryState.verify(input);
      if (changes.length > 0) return yield* stale(changes);
    });

    const makeFileSystem = Effect.fnUntraced(function* () {
      const fileSystem = yield* MemoryFileSystem.make.pipe(
        Effect.provideService(Digest.Digest, digest),
        Effect.provideService(SecureRandom.SecureRandom, secureRandom),
      );
      yield* fileSystem.makeDirectory(workspaceRoot, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new ApplyFailure({
              message: `Could not initialize the workspace: ${error.message}`,
              cause: error,
            }),
        ),
      );
      return fileSystem;
    });

    /**
     * Builds the workspace over `fileSystem`. `admit` decides which Apply runs
     * for a Plan, given whether this workspace built it.
     */
    const makeWorkspace = (
      fileSystem: FileSystem.FileSystem,
      admit: (
        apply: Apply,
        builtHere: boolean,
      ) => Effect.Effect<Apply, ApplyFailure | StalePlanFailure>,
    ): ApplyWorkspace => {
      const fileSystemLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fileSystem),
        Layer.succeed(Path.Path, virtualPath),
        Layer.succeed(Digest.Digest, digest),
      );
      // The host and private roots can have the same path; retain the origin of Plans built here.
      const workspacePlans = new WeakSet<Plan>();
      const plan = Effect.fn("ApplyWorkspace.plan")(function* ({
        blueprint,
        config,
      }: Parameters<ApplyWorkspace["plan"]>[0]) {
        const service = yield* PlanService;
        const result = yield* service.build({
          blueprint,
          config,
          repoRoot: workspaceRoot,
        });
        workspacePlans.add(result);
        return result;
      });

      const materialize: ApplyWorkspace["materialize"] = Effect.fn(
        "ApplyWorkspace.materialize",
      )(function* (apply) {
        const workspaceApply = yield* admit(
          apply,
          workspacePlans.has(apply.plan),
        );
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
                      message: `Could not read ${path} after Apply: ${error.message}`,
                      cause: error,
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
                Layer.provide(Layer.succeed(CatalogService, catalog)),
                Layer.provide(fileSystemLayer),
              ),
            ),
          ),
        materialize,
      } satisfies ApplyWorkspace;
    };

    const empty: ApplyWorkspaceServiceShape["empty"] = Effect.fn(
      "ApplyWorkspaceService.empty",
    )(function* () {
      const fileSystem = yield* makeFileSystem();

      return makeWorkspace(fileSystem, (apply) =>
        apply.plan.baseline.root === workspaceRoot
          ? Effect.succeed(apply)
          : Effect.fail(stale([{ path: ".", kind: "rootChanged" }])),
      );
    });

    const fromRepository: ApplyWorkspaceServiceShape["fromRepository"] =
      Effect.fn("ApplyWorkspaceService.fromRepository")(function* (input) {
        yield* verify(input);
        const fileSystem = yield* makeFileSystem();

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
                          message: `Could not seed ${entry.path}: ${error.message}`,
                          cause: error,
                        }),
                    ),
                  );
                return;
              }
              const contents = yield* hostFileSystem.readFile(sourcePath).pipe(
                Effect.mapError(
                  (error) =>
                    new ApplyFailure({
                      message: `Could not read ${sourcePath}: ${error.message}`,
                      cause: error,
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
                        message: `Could not seed ${entry.path}: ${error.message}`,
                        cause: error,
                      }),
                  ),
                );
            }),
          { concurrency: 1, discard: true },
        );
        yield* verify(input);

        return makeWorkspace(
          fileSystem,
          Effect.fnUntraced(function* (apply, builtHere) {
            if (builtHere && apply.plan.baseline.root === workspaceRoot) {
              return apply;
            }
            if (apply.plan.baseline.root !== input.baseline.root) {
              return yield* stale([{ path: ".", kind: "rootChanged" }]);
            }
            yield* verify({
              baseline: apply.plan.baseline,
              repoRoot: input.repoRoot,
            });
            if (
              input.baseline.paths.length !==
                apply.plan.baseline.paths.length ||
              RepositoryState.compare(input.baseline, apply.plan.baseline)
                .length > 0
            ) {
              return yield* new ApplyFailure({
                message:
                  "Apply baseline differs from the seeded workspace. Create a new workspace for this Plan.",
              });
            }
            return new Apply({
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
          }),
        );
      });

    return { empty, fromRepository } satisfies ApplyWorkspaceServiceShape;
  });

  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(RepositoryState.RepositoryState.layer),
  );
}
