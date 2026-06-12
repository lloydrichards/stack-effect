import { PlanFailure, type RepoSnapshot } from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Order,
  Path,
} from "effect";

export class RepoSnapshotService extends Context.Service<RepoSnapshotService>()(
  "RepoSnapshotService",
  {
    make: Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const load = Effect.fn("RepoSnapshotService.load")(function* ({
        paths,
        repoRoot,
      }: {
        paths: ReadonlyArray<string>;
        repoRoot: string;
      }) {
        const snapshotPaths = Arr.fromIterable(new Set(paths)).sort(
          Order.String,
        );

        const snapshotEntries = yield* Effect.all(
          snapshotPaths.map((snapshotPath) =>
            Effect.gen(function* () {
              const absolutePath = path.join(repoRoot, snapshotPath);
              const pathStat = yield* fileSystem.stat(absolutePath).pipe(
                Effect.catchTag("PlatformError", (error) =>
                  error.reason._tag === "NotFound"
                    ? Effect.succeed(null)
                    : Effect.fail(error),
                ),
                Effect.mapError(
                  (err) =>
                    new PlanFailure({
                      reason: "repoRootNotEmpty",
                      message: `Could not inspect ${snapshotPath} during planning: ${err.message}`,
                    }),
                ),
              );

              if (pathStat === null) {
                return {
                  _tag: "missing",
                  path: snapshotPath,
                } satisfies typeof RepoSnapshot.fields.paths.value.Type;
              }

              if (pathStat.type === "Directory") {
                return {
                  _tag: "directory",
                  path: snapshotPath,
                } satisfies typeof RepoSnapshot.fields.paths.value.Type;
              }

              const contents = yield* fileSystem
                .readFileString(absolutePath)
                .pipe(
                  Effect.mapError(
                    (err) =>
                      new PlanFailure({
                        reason: "repoRootNotEmpty",
                        message: `Could not read ${snapshotPath} during planning: ${err.message}`,
                      }),
                  ),
                );

              return {
                _tag: "file",
                path: snapshotPath,
                contents,
              } satisfies typeof RepoSnapshot.fields.paths.value.Type;
            }),
          ),
        );

        return {
          paths: snapshotEntries,
        } satisfies typeof RepoSnapshot.Type;
      });

      return { load } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(RepoSnapshotService)(
    RepoSnapshotService.make,
  );
}
