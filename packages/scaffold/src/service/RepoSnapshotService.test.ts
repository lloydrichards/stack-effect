import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Match, Path } from "effect";
import { RepoSnapshotService } from "./RepoSnapshotService";

type MockPathEntry =
  | { readonly _tag: "directory" }
  | { readonly _tag: "file"; readonly contents: string }
  | { readonly _tag: "readError"; readonly error: unknown }
  | { readonly _tag: "statError"; readonly error: unknown };

const testRepoRoot = "/repo";

const makeFileSystemLayer = (entries: Record<string, MockPathEntry>) => {
  const getEntry = (absolutePath: string) =>
    entries[absolutePath] ?? {
      _tag: "PlatformError",
      message: `Missing path: ${absolutePath}`,
      reason: {
        _tag: "NotFound",
      },
    };

  const fileSystem = {
    stat: (absolutePath: string) =>
      Match.value(getEntry(absolutePath)).pipe(
        Match.when({ _tag: "PlatformError" }, Effect.fail),
        Match.when({ _tag: "statError" }, ({ error }) => Effect.fail(error)),
        Match.when({ _tag: "directory" }, () =>
          Effect.succeed({ type: "Directory" as const }),
        ),
        Match.orElse(() => Effect.succeed({ type: "File" as const })),
      ),
    readFileString: (absolutePath: string) =>
      Match.value(getEntry(absolutePath)).pipe(
        Match.when({ _tag: "PlatformError" }, Effect.fail),
        Match.when({ _tag: "readError" }, ({ error }) => Effect.fail(error)),
        Match.when({ _tag: "file" }, ({ contents }) =>
          Effect.succeed(contents),
        ),
        Match.orElse(() =>
          Effect.fail(new Error(`Expected file at ${absolutePath}`)),
        ),
      ),
  } as FileSystem.FileSystem;

  return Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fileSystem),
    Path.layer,
  );
};

const makeRepoSnapshotLayer = (entries: Record<string, MockPathEntry>) => {
  return RepoSnapshotService.layer.pipe(
    Layer.provide(makeFileSystemLayer(entries)),
  );
};

const loadSnapshot = ({
  layer,
  paths,
}: {
  layer: Layer.Layer<RepoSnapshotService>;
  paths: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const repoSnapshot = yield* RepoSnapshotService;
    return yield* repoSnapshot.load({ paths, repoRoot: testRepoRoot });
  }).pipe(Effect.provide(layer));

describe("RepoSnapshotService", () => {
  describe("when loading requested paths", () => {
    it.effect(
      "should deduplicate and sort requested paths before inspection",
      () =>
        Effect.gen(function* () {
          const snapshot = yield* loadSnapshot({
            layer: makeRepoSnapshotLayer({
              "/repo/apps": { _tag: "directory" },
              "/repo/apps/server.ts": { _tag: "file", contents: "server" },
            }),
            paths: ["apps/server.ts", "apps", "apps/server.ts"],
          });

          expect(snapshot.paths).toEqual([
            { _tag: "directory", path: "apps" },
            { _tag: "file", path: "apps/server.ts", contents: "server" },
          ]);
        }),
    );

    it.effect(
      "should return missing, directory, and file snapshot entries",
      () =>
        Effect.gen(function* () {
          const snapshot = yield* loadSnapshot({
            layer: makeRepoSnapshotLayer({
              "/repo/apps": { _tag: "directory" },
              "/repo/apps/server.ts": { _tag: "file", contents: "server" },
            }),
            paths: ["missing.ts", "apps/server.ts", "apps"],
          });

          expect(snapshot.paths).toEqual([
            { _tag: "directory", path: "apps" },
            { _tag: "file", path: "apps/server.ts", contents: "server" },
            { _tag: "missing", path: "missing.ts" },
          ]);
        }),
    );
  });

  describe("when filesystem inspection fails", () => {
    it.effect("should fail with PlanFailure when path inspection fails", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          loadSnapshot({
            layer: makeRepoSnapshotLayer({
              "/repo/apps/server.ts": {
                _tag: "statError",
                error: new Error("stat exploded"),
              },
            }),
            paths: ["apps/server.ts"],
          }),
        );

        expect(error).toMatchObject({
          _tag: "PlanFailure",
          reason: "repoRootNotEmpty",
          message: "stat exploded",
        });
      }),
    );

    it.effect("should fail with PlanFailure when file reads fail", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          loadSnapshot({
            layer: makeRepoSnapshotLayer({
              "/repo/apps/server.ts": {
                _tag: "readError",
                error: new Error("read exploded"),
              },
            }),
            paths: ["apps/server.ts"],
          }),
        );

        expect(error).toMatchObject({
          _tag: "PlanFailure",
          reason: "repoRootNotEmpty",
          message: "read exploded",
        });
      }),
    );
  });
});
