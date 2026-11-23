import { FileSystemTesting, MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, PlatformError, Ref } from "effect";
import { RepositoryState } from "./RepositoryState";

const repoRoot = "/repo";

/** Seed a memory repository and return its capture, optionally failing one method for one path. */
const prepareCapture = ({
  files,
  paths,
  fault,
}: {
  readonly files: Record<string, string>;
  readonly paths: ReadonlyArray<string>;
  readonly fault?: {
    readonly method: "lstat" | "readFile";
    readonly path: string;
  };
}) =>
  Effect.gen(function* () {
    const base = yield* MemoryFileSystem.make;
    yield* base.makeDirectory(repoRoot, { recursive: true });
    yield* Effect.forEach(
      Object.entries(files),
      ([path, contents]) =>
        base
          .makeDirectory(
            `${repoRoot}/${path.slice(0, path.lastIndexOf("/"))}`,
            {
              recursive: true,
            },
          )
          .pipe(
            Effect.andThen(
              base.writeFileString(`${repoRoot}/${path}`, contents),
            ),
          ),
      { discard: true },
    );

    const { fileSystem, state: fired } = yield* FileSystemTesting.make(
      base,
      Effect.fnUntraced(function* () {
        const fired = yield* Ref.make(false);
        const inject = (method: string) => (path: string) =>
          fault?.method === method && path === `${repoRoot}/${fault.path}`
            ? Ref.set(fired, true).pipe(
                Effect.andThen(
                  Effect.fail(
                    PlatformError.systemError({
                      _tag: "Unknown",
                      module: "FileSystem",
                      method,
                      description: `${method} exploded`,
                      pathOrDescriptor: path,
                    }),
                  ),
                ),
              )
            : Effect.void;
        return {
          state: fired,
          handlers: { lstat: inject("lstat"), readFile: inject("readFile") },
        };
      }),
    );

    const capture = Effect.gen(function* () {
      const state = yield* RepositoryState;
      return yield* state.capture({ repoRoot, paths });
    }).pipe(
      Effect.provide(
        RepositoryState.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(FileSystem.FileSystem, fileSystem),
              Path.layer,
              BrowserCrypto.layer,
            ),
          ),
        ),
      ),
    );
    return { capture, fired };
  }).pipe(Effect.provide(BrowserCrypto.layer));

describe("RepositoryState.capture", () => {
  it.effect(
    "should return missing, directory, and file entries with fingerprints",
    () =>
      Effect.gen(function* () {
        const { capture } = yield* prepareCapture({
          files: { "apps/server.ts": "server" },
          paths: ["missing.ts", "apps/server.ts", "apps"],
        });
        const { baseline, snapshot } = yield* capture;

        assert.deepStrictEqual(snapshot.paths, [
          { _tag: "directory", path: "apps" },
          { _tag: "file", path: "apps/server.ts", contents: "server" },
          { _tag: "missing", path: "missing.ts" },
        ]);
        assert.deepStrictEqual(
          baseline.paths.map((entry) => entry._tag),
          ["directory", "file", "missing"],
        );
        assert.strictEqual(baseline.root, repoRoot);
      }),
  );

  for (const { method, message } of [
    {
      method: "lstat",
      message: "Could not inspect apps/server.ts during planning",
    },
    {
      method: "readFile",
      message: "Could not read apps/server.ts during planning",
    },
  ] as const) {
    it.effect(`should fail with PlanFailure when ${method} fails`, () =>
      Effect.gen(function* () {
        const { capture, fired } = yield* prepareCapture({
          files: { "apps/server.ts": "server" },
          paths: ["apps/server.ts"],
          fault: { method, path: "apps/server.ts" },
        });
        const failure = yield* Effect.flip(capture);

        assert.isTrue(yield* Ref.get(fired));
        assert.strictEqual(failure._tag, "PlanFailure");
        assert.include(failure.message, message);
        assert.include(failure.message, `${method} exploded`);
      }),
    );
  }
});
