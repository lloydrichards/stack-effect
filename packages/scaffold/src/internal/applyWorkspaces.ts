import { MemoryFileSystem } from "@effect-vfs/memory";
import { CatalogReader } from "@repo/catalog/Catalog";
import {
  Apply,
  ApplyFailure,
  ApplyResult,
  MaterializedApply,
  StalePlanFailure,
  type StalePlanChange,
} from "@repo/domain/Apply";
import {
  Plan,
  type PlanBaseline,
  repositoryRootPath,
  byPath,
} from "@repo/domain/Plan";
import { Effect, FileSystem, Layer, Path } from "effect";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import type { Applier, ApplyWorkspace, ApplyWorkspaces } from "../Apply";
import { Planner } from "../Plan";
import * as RepositoryState from "./repositoryState";

const workspaceRoot = "/workspace";

/** @internal */
export const makeApplyWorkspaces = (ApplierService: typeof Applier) =>
  Effect.gen(function* () {
    const hostFileSystem = yield* FileSystem.FileSystem;
    const hostPath = yield* Path.Path;
    const virtualPath = yield* Path.Path.pipe(Effect.provide(Path.layer));
    const repositoryState = yield* RepositoryState.RepositoryState;
    const digest = yield* Digest.Digest;
    const secureRandom = yield* SecureRandom.SecureRandom;
    const catalog = yield* CatalogReader;

    const stale = (changes: ReadonlyArray<StalePlanChange>) =>
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
      readonly repositoryRoot: string;
      readonly baseline: PlanBaseline;
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

    // `admit` decides which Apply runs for a Plan, given whether this workspace built it.
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
        const service = yield* Planner;
        const result = yield* service.build({
          blueprint,
          config,
          repositoryRoot: workspaceRoot,
        });
        workspacePlans.add(result);
        return result;
      });

      const materialize = Effect.fn("ApplyWorkspace.materialize")(function* (
        apply: Apply,
      ) {
        const workspaceApply = yield* admit(
          apply,
          workspacePlans.has(apply.plan),
        );

        const result = yield* Effect.gen(function* () {
          const service = yield* ApplierService;
          return yield* service.apply({
            apply: workspaceApply,
            repositoryRoot: workspaceRoot,
          });
        }).pipe(
          Effect.provide(
            Layer.fresh(ApplierService.layer).pipe(
              Layer.provide(fileSystemLayer),
            ),
          ),
        );

        const successfulPaths = [
          ...result.created.map((path) => ({
            path,
            status: "created" as const,
          })),
          ...result.modified.map((path) => ({
            path,
            status: "modified" as const,
          })),
        ].sort(byPath);
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
        return MaterializedApply.make({ apply: result, files });
      });

      return {
        plan: (input) =>
          plan(input).pipe(
            Effect.provide(
              Layer.fresh(Planner.layer).pipe(
                Layer.provide(Layer.succeed(CatalogReader, catalog)),
                Layer.provide(fileSystemLayer),
              ),
            ),
          ),
        materialize,
      };
    };

    const empty = Effect.gen(function* () {
      const fileSystem = yield* makeFileSystem();

      return makeWorkspace(
        fileSystem,
        Effect.fnUntraced(function* (apply) {
          if (apply.plan.baseline.root !== workspaceRoot) {
            return yield* stale([
              { path: repositoryRootPath, kind: "rootChanged" },
            ]);
          }
          return apply;
        }),
      );
    }).pipe(Effect.withSpan("ApplyWorkspaces.empty"));

    const seedFailure =
      (path: string) => (error: { readonly message: string }) =>
        new ApplyFailure({
          message: `Could not seed ${path}: ${error.message}`,
          cause: error,
        });

    const seedFile = Effect.fnUntraced(function* (
      fileSystem: FileSystem.FileSystem,
      repositoryRoot: string,
      path: string,
    ) {
      const sourcePath = hostPath.join(repositoryRoot, path);
      const targetPath = virtualPath.join(workspaceRoot, path);
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
          Effect.mapError(seedFailure(path)),
        );
    });

    const seedFileSystem = Effect.fnUntraced(function* (
      fileSystem: FileSystem.FileSystem,
      repositoryRoot: string,
      baseline: PlanBaseline,
    ) {
      for (const entry of baseline.paths) {
        if (entry._tag === "missing") continue;

        if (entry._tag === "directory") {
          yield* fileSystem
            .makeDirectory(virtualPath.join(workspaceRoot, entry.path), {
              recursive: true,
            })
            .pipe(Effect.mapError(seedFailure(entry.path)));
          continue;
        }

        yield* seedFile(fileSystem, repositoryRoot, entry.path);
      }

      // Apply checks package ownership across the whole repository, so seed every
      // owner manifest the baseline paths left out.
      const owners =
        baseline.packageOwners ??
        (yield* repositoryState
          .discoverOwners(repositoryRoot)
          .pipe(
            Effect.mapError(
              (error) =>
                new ApplyFailure({ message: error.message, cause: error }),
            ),
          ));
      const seededPaths = new Set<string>(
        baseline.paths.map((entry) => entry.path),
      );
      for (const owner of owners) {
        const manifestPath = `${owner.path}/package.json`;
        if (seededPaths.has(manifestPath)) continue;
        yield* seedFile(fileSystem, repositoryRoot, manifestPath);
      }
    });

    const fromRepository = Effect.fn("ApplyWorkspaces.fromRepository")(
      function* (input: {
        readonly repositoryRoot: string;
        readonly baseline: PlanBaseline;
      }) {
        yield* verify(input);
        const fileSystem = yield* makeFileSystem();

        yield* seedFileSystem(fileSystem, input.repositoryRoot, input.baseline);
        yield* verify(input);

        return makeWorkspace(
          fileSystem,
          Effect.fnUntraced(function* (apply, builtHere) {
            if (builtHere && apply.plan.baseline.root === workspaceRoot) {
              return apply;
            }
            if (apply.plan.baseline.root !== input.baseline.root) {
              return yield* stale([
                { path: repositoryRootPath, kind: "rootChanged" },
              ]);
            }
            yield* verify({
              baseline: apply.plan.baseline,
              repositoryRoot: input.repositoryRoot,
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
                  packageOwners: apply.plan.baseline.packageOwners,
                  paths: apply.plan.baseline.paths.map((entry) =>
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
      },
    );

    return { empty, fromRepository } satisfies ApplyWorkspaces["Service"];
  });
