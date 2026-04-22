import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Blueprint } from "@repo/domain/Blueprint";
import {
  PlanFailure,
  type RepoSnapshot,
  type RepoSnapshotPath,
} from "@repo/domain/Plan";
import { Effect } from "effect";
import { collectSnapshotPaths } from "../plan";

export const RepoSnapshotLoader = {
  load: Effect.fn("RepoSnapshotLoader.load")(function* ({
    blueprint,
    repoRoot,
  }: {
    blueprint: Blueprint;
    repoRoot: string;
  }) {
    const snapshotPaths = collectSnapshotPaths(blueprint);
    const rootEntries: Array<string> = yield* Effect.tryPromise({
      try: () => readdir(repoRoot),
      catch: (error) =>
        new PlanFailure({
          reason: "repoRootNotEmpty",
          message:
            error instanceof Error
              ? error.message
              : "Could not read repo root for planning.",
        }),
    });

    const paths: Array<RepoSnapshotPath> = [];

    for (const path of snapshotPaths) {
      const absolutePath = join(repoRoot, path);
      const pathStat = yield* Effect.tryPromise({
        try: async () => {
          try {
            return await stat(absolutePath);
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "ENOENT"
            ) {
              return null;
            }

            throw error;
          }
        },
        catch: (error) =>
          new PlanFailure({
            reason: "repoRootNotEmpty",
            message:
              error instanceof Error
                ? error.message
                : `Could not inspect ${path} during planning.`,
          }),
      });

      if (pathStat === null) {
        paths.push({ _tag: "missing", path });
        continue;
      }

      if (pathStat.isDirectory()) {
        paths.push({ _tag: "directory", path });
        continue;
      }

      const contents = yield* Effect.tryPromise({
        try: () => readFile(absolutePath, "utf8"),
        catch: (error) =>
          new PlanFailure({
            reason: "repoRootNotEmpty",
            message:
              error instanceof Error
                ? error.message
                : `Could not read ${path} during planning.`,
          }),
      });

      paths.push({ _tag: "file", path, contents });
    }

    return {
      rootEntries: [...rootEntries].sort((left, right) =>
        left.localeCompare(right),
      ),
      paths,
    } satisfies RepoSnapshot;
  }),
};
