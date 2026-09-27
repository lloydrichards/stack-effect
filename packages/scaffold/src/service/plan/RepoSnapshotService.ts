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

        const snapshotEntries = yield* Effect.forEach(
          snapshotPaths,
          (snapshotPath) =>
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
                const link = yield* fileSystem.readLink(absolutePath).pipe(
                  Effect.map(() => true),
                  Effect.orElseSucceed(() => false),
                );
                if (link) {
                  return yield* new PlanFailure({
                    reason: "repoStateUnsupported",
                    message: `Symbolic link in repository path ${snapshotPath} is unsupported.`,
                  });
                }
                return {
                  _tag: "missing",
                  path: snapshotPath,
                } satisfies typeof RepoSnapshot.fields.paths.value.Type;
              }

              const isLink =
                snapshotPath !== "." &&
                (yield* fileSystem.readLink(absolutePath).pipe(
                  Effect.map(() => true),
                  Effect.orElseSucceed(() => false),
                ));
              if (isLink) {
                return yield* new PlanFailure({
                  reason: "repoStateUnsupported",
                  message: `Symbolic link in repository path ${snapshotPath} is unsupported.`,
                });
              }

              if (pathStat.type === "Directory") {
                return {
                  _tag: "directory",
                  path: snapshotPath,
                } satisfies typeof RepoSnapshot.fields.paths.value.Type;
              }

              if (pathStat.type !== "File") {
                return yield* new PlanFailure({
                  reason: "repoStateUnsupported",
                  message: `Unsupported repository entry at ${snapshotPath}: ${pathStat.type}.`,
                });
              }

              const bytes = yield* fileSystem.readFile(absolutePath).pipe(
                Effect.mapError(
                  (err) =>
                    new PlanFailure({
                      reason: "repoRootNotEmpty",
                      message: `Could not read ${snapshotPath} during planning: ${err.message}`,
                    }),
                ),
              );

              const contents = yield* Effect.try({
                try: () => {
                  if (bytes.includes(0)) throw new Error("NUL byte");
                  return new TextDecoder("utf-8", {
                    fatal: true,
                    ignoreBOM: true,
                  }).decode(bytes);
                },
                catch: () =>
                  new PlanFailure({
                    reason: "repoStateUnsupported",
                    message: `Non-text repository file at ${snapshotPath} is unsupported.`,
                  }),
              });

              return {
                _tag: "file",
                path: snapshotPath,
                contents,
              } satisfies typeof RepoSnapshot.fields.paths.value.Type;
            }),
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
