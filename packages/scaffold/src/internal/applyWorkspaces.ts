import { MemoryFileSystem } from "@effect-vfs/memory";
import { CatalogReader } from "@repo/catalog/Catalog";
import {
  Apply,
  ApplyError,
  ApplyResult,
  MaterializedApply,
  MaterializedFile,
  StalePlan,
  StalePlanChange,
} from "@repo/domain/Apply";
import {
  Plan,
  type PlanBaseline,
  type PlanBaselinePath,
  type RepositoryPath,
  repositoryRootPath,
  byPath,
} from "@repo/domain/Plan";
import { Effect, FileSystem, Layer, Match, Path } from "effect";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import type { Applier, ApplyWorkspace, ApplyWorkspaces } from "../Apply";
import { Planner } from "../Plan";
import * as RepositoryState from "./repositoryState";

const workspaceRoot = "/workspace";

// A host repository copied into one workspace filesystem.
type WorkspaceSeed = {
  repository: RepositoryState.Repository;
  repositoryRoot: string;
  fileSystem: FileSystem.FileSystem;
};

const emptyResult = new ApplyResult({
  created: [],
  modified: [],
  skipped: [],
  failed: [],
});

const stalePlanMessage = (changes: ReadonlyArray<StalePlanChange>) =>
  `Repository changed since planning: ${changes.map((change) => `${change.path} (${change.kind})`).join(", ")}. Replan and try again.`;

const rootChanges = [
  StalePlanChange.make({ path: repositoryRootPath, kind: "rootChanged" }),
];

const rootChanged = new StalePlan({
  changes: rootChanges,
  partialResult: emptyResult,
  message: stalePlanMessage(rootChanges),
});

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

    const verify = Effect.fnUntraced(function* (
      repository: RepositoryState.Repository,
      baseline: PlanBaseline,
    ) {
      const changes = yield* repository.verify(baseline);
      if (changes.length > 0) {
        return yield* new StalePlan({
          changes,
          partialResult: emptyResult,
          message: stalePlanMessage(changes),
        });
      }
    });

    const makeFileSystem = Effect.fnUntraced(function* () {
      const fileSystem = yield* MemoryFileSystem.make.pipe(
        Effect.provideService(Digest.Digest, digest),
        Effect.provideService(SecureRandom.SecureRandom, secureRandom),
      );
      yield* fileSystem.makeDirectory(workspaceRoot, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new ApplyError({
              message: "Could not initialize the workspace",
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
      ) => Effect.Effect<Apply, ApplyError | StalePlan>,
    ): ApplyWorkspace => {
      const fileSystemLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fileSystem),
        Layer.succeed(Path.Path, virtualPath),
        Layer.succeed(Digest.Digest, digest),
      );
      const readBack = (
        path: RepositoryPath,
        status: MaterializedFile["status"],
      ) =>
        fileSystem.readFileString(virtualPath.join(workspaceRoot, path)).pipe(
          Effect.map((contents) =>
            MaterializedFile.make({ path, status, contents }),
          ),
          Effect.mapError(
            (error) =>
              new ApplyError({
                message: `Could not read ${path} after Apply`,
                cause: error,
              }),
          ),
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

        const files = [
          ...(yield* Effect.forEach(result.created, (path) =>
            readBack(path, "created"),
          )),
          ...(yield* Effect.forEach(result.modified, (path) =>
            readBack(path, "modified"),
          )),
        ].sort(byPath);
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
            return yield* rootChanged;
          }
          return apply;
        }),
      );
    }).pipe(Effect.withSpan("ApplyWorkspaces.empty"));

    const seedFile = Effect.fnUntraced(function* (
      seed: WorkspaceSeed,
      path: string,
    ) {
      const sourcePath = hostPath.join(seed.repositoryRoot, path);
      const targetPath = virtualPath.join(workspaceRoot, path);
      const contents = yield* hostFileSystem.readFile(sourcePath).pipe(
        Effect.mapError(
          (error) =>
            new ApplyError({
              message: `Could not read ${sourcePath}`,
              cause: error,
            }),
        ),
      );
      yield* seed.fileSystem
        .makeDirectory(virtualPath.dirname(targetPath), {
          recursive: true,
        })
        .pipe(
          Effect.andThen(seed.fileSystem.writeFile(targetPath, contents)),
          Effect.mapError(
            (error) =>
              new ApplyError({
                message: `Could not seed ${path}`,
                cause: error,
              }),
          ),
        );
    });

    const seedEntry = (seed: WorkspaceSeed, entry: PlanBaselinePath) =>
      Match.valueTags(entry, {
        missing: () => Effect.void,
        directory: ({ path }) =>
          seed.fileSystem
            .makeDirectory(virtualPath.join(workspaceRoot, path), {
              recursive: true,
            })
            .pipe(
              Effect.mapError(
                (error) =>
                  new ApplyError({
                    message: `Could not seed ${path}`,
                    cause: error,
                  }),
              ),
            ),
        file: ({ path }) => seedFile(seed, path),
      });

    const seedFileSystem = Effect.fnUntraced(function* (
      seed: WorkspaceSeed,
      baseline: PlanBaseline,
    ) {
      yield* Effect.forEach(baseline.paths, (entry) => seedEntry(seed, entry), {
        discard: true,
      });

      // Apply checks package ownership across the whole repository, so seed every
      // owner manifest the baseline paths left out.
      const owners =
        baseline.packageOwners ??
        (yield* seed.repository.discoverOwners.pipe(
          Effect.mapError(
            (error) => new ApplyError({ message: error.message, cause: error }),
          ),
        ));
      const seededPaths = new Set<string>(
        baseline.paths.map((entry) => entry.path),
      );
      yield* Effect.forEach(
        owners
          .map((owner) => `${owner.path}/package.json`)
          .filter((manifestPath) => !seededPaths.has(manifestPath)),
        (manifestPath) => seedFile(seed, manifestPath),
        { discard: true },
      );
    });

    const fromRepository = Effect.fn("ApplyWorkspaces.fromRepository")(
      function* (input: {
        readonly repositoryRoot: string;
        readonly baseline: PlanBaseline;
      }) {
        const repository = repositoryState.at(input.repositoryRoot);
        yield* verify(repository, input.baseline);
        const fileSystem = yield* makeFileSystem();

        yield* seedFileSystem(
          { repository, repositoryRoot: input.repositoryRoot, fileSystem },
          input.baseline,
        );
        yield* verify(repository, input.baseline);

        return makeWorkspace(
          fileSystem,
          Effect.fnUntraced(function* (apply, builtHere) {
            if (builtHere && apply.plan.baseline.root === workspaceRoot) {
              return apply;
            }
            if (apply.plan.baseline.root !== input.baseline.root) {
              return yield* rootChanged;
            }
            yield* verify(repository, apply.plan.baseline);
            if (
              input.baseline.paths.length !==
                apply.plan.baseline.paths.length ||
              RepositoryState.compare(input.baseline, apply.plan.baseline)
                .length > 0
            ) {
              return yield* new ApplyError({
                message:
                  "Apply baseline differs from the seeded workspace. Create a new workspace for this Plan.",
              });
            }
            return new Apply({
              plan: new Plan({
                baseline: {
                  root: workspaceRoot,
                  packageOwners: apply.plan.baseline.packageOwners,
                  paths: apply.plan.baseline.paths.map(
                    (entry): PlanBaselinePath =>
                      entry.path === "." && entry._tag === "missing"
                        ? { _tag: "directory", path: entry.path }
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
