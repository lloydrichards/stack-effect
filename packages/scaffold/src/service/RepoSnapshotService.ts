import type { Blueprint } from "@repo/domain/Blueprint";
import {
  PlanFailure,
  type RepoSnapshot,
  type RepoSnapshotPath,
} from "@repo/domain/Plan";
import { Context, Effect, FileSystem, Layer, Path } from "effect";

import { collectSnapshotPaths } from "../plan";

export class RepoSnapshotService extends Context.Service<RepoSnapshotService>()(
  "RepoSnapshotService",
  {
    make: Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const load = Effect.fn("RepoSnapshotService.load")(function* ({
        blueprint,
        repoRoot,
      }: {
        blueprint: Blueprint;
        repoRoot: string;
      }) {
        const snapshotPaths = collectSnapshotPaths(blueprint);
        const rootEntries: Array<string> = yield* fileSystem
          .readDirectory(repoRoot)
          .pipe(
            Effect.mapError(
              toPlanFailure("Could not read repo root for planning."),
            ),
          );

        const paths: Array<RepoSnapshotPath> = [];

        for (const snapshotPath of snapshotPaths) {
          const absolutePath = path.join(repoRoot, snapshotPath);
          const pathStat = yield* fileSystem.stat(absolutePath).pipe(
            Effect.catchTag("PlatformError", (error) =>
              error.reason._tag === "NotFound"
                ? Effect.succeed(null)
                : Effect.fail(error),
            ),
            Effect.mapError(
              toPlanFailure(
                `Could not inspect ${snapshotPath} during planning.`,
              ),
            ),
          );

          if (pathStat === null) {
            paths.push({ _tag: "missing", path: snapshotPath });
            continue;
          }

          if (pathStat.type === "Directory") {
            paths.push({ _tag: "directory", path: snapshotPath });
            continue;
          }

          const contents = yield* fileSystem
            .readFileString(absolutePath)
            .pipe(
              Effect.mapError(
                toPlanFailure(
                  `Could not read ${snapshotPath} during planning.`,
                ),
              ),
            );

          paths.push({ _tag: "file", path: snapshotPath, contents });
        }

        return {
          rootEntries: [...rootEntries].sort((left, right) =>
            left.localeCompare(right),
          ),
          paths,
        } satisfies RepoSnapshot;
      });

      return { load } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(RepoSnapshotService)(
    RepoSnapshotService.make,
  );
}

const toPlanFailure = (fallbackMessage: string) => (error: unknown) =>
  new PlanFailure({
    reason: "repoRootNotEmpty",
    message: getErrorMessage(error, fallbackMessage),
  });

const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallbackMessage;
};
