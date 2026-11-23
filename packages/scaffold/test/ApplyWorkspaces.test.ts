// This test intentionally constructs a Windows Path service from Node's win32 implementation.
// @effect-diagnostics nodeBuiltinImport:off

import nodePath from "node:path";
import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { assert, describe, it } from "@effect/vitest";
import { Apply } from "@repo/domain/Apply";
import { ApplyWorkspaces } from "@repo/scaffold/ApplyWorkspaces";
import { BlueprintService } from "@repo/scaffold/BlueprintService";
import { PlanService } from "@repo/scaffold/PlanService";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import {
  app,
  config,
  decideAll,
  exists,
  paths,
  plan,
  preview,
  readFile,
  repositoryRoot,
  selected,
  selection,
  TestCatalogLayer,
  writeFiles,
  testPipeline,
} from "./fixtures/scaffold";

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

const manifest = "packages/app/package.json";
const tsconfig = "packages/app/tsconfig.json";

describe("ApplyWorkspaces", () => {
  it.effect(
    "should preview an incremental Apply without touching the host repository",
    () =>
      Effect.gen(function* () {
        const original = '{"name":"@repo/app","private":true}';
        yield* writeFiles({
          [manifest]: original,
          [tsconfig]: "{}\n",
          "packages/app/notes.txt": "user notes",
        });
        const planned = yield* plan(app("scripts", "tsconfig", "pair"));

        const result = yield* preview(planned, decideAll(planned, "skip"));

        assert.deepStrictEqual(
          result.apply.created,
          paths("packages/app/src/a.txt", "packages/app/src/b.txt"),
        );
        assert.deepStrictEqual(result.apply.modified, paths(manifest));
        assert.deepStrictEqual(result.apply.skipped, paths(tsconfig));
        assert.deepStrictEqual(result.apply.failed, []);
        assert.deepStrictEqual(
          result.files.map((file) => [file.path, file.status]),
          [
            [manifest, "modified"],
            ["packages/app/src/a.txt", "created"],
            ["packages/app/src/b.txt", "created"],
          ],
        );
        assert.deepStrictEqual(decodeJson(result.files[0]?.contents), {
          name: "@repo/app",
          private: true,
          scripts: { dev: "vite" },
        });
        assert.strictEqual(yield* readFile(manifest), original);
        assert.strictEqual(yield* readFile(tsconfig), "{}\n");
        assert.strictEqual(
          yield* readFile("packages/app/notes.txt"),
          "user notes",
        );
        assert.isFalse(yield* exists("packages/app/src"));
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should seed byte-order-marked files with their exact bytes", () =>
    Effect.gen(function* () {
      const original = "\uFEFFA\n";
      yield* writeFiles({ "packages/app/src/a.txt": original });
      const planned = yield* plan(app("pair"));

      const result = yield* preview(planned, decideAll(planned, "skip"));

      assert.deepStrictEqual(
        result.apply.created,
        paths("packages/app/src/b.txt"),
      );
      const files = yield* FileSystem.FileSystem;
      assert.deepStrictEqual(
        yield* files.readFile(`${repositoryRoot}/packages/app/src/a.txt`),
        new TextEncoder().encode(original),
      );
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should use POSIX paths when the host uses Windows", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* MemoryFileSystem.make.pipe(
        Effect.provide(BrowserCrypto.layer),
      );
      const posixPath = yield* Path.Path.pipe(Effect.provide(Path.layer));
      const windowsPath = Path.Path.of({
        ...posixPath,
        sep: "\\",
        basename: nodePath.win32.basename,
        dirname: nodePath.win32.dirname,
        extname: nodePath.win32.extname,
        format: nodePath.win32.format,
        isAbsolute: nodePath.win32.isAbsolute,
        join: nodePath.win32.join,
        normalize: nodePath.win32.normalize,
        parse: nodePath.win32.parse,
        relative: nodePath.win32.relative,
        resolve: nodePath.win32.resolve,
        toNamespacedPath: nodePath.win32.toNamespacedPath,
      });
      const hostLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, hostFileSystem),
        Layer.succeed(Path.Path, windowsPath),
        BrowserCrypto.layer,
        TestCatalogLayer,
      );
      const windowsRoot = "C:\\repo";
      // Root files only: the memory host cannot create Windows directories.
      const original = '{"name":"windows-app"}';
      const hostManifest = nodePath.win32.join(windowsRoot, "package.json");
      yield* hostFileSystem.writeFileString(hostManifest, original);

      const result = yield* Effect.gen(function* () {
        const planned = yield* plan(
          selection(selected("workspace", "windows-app", "root-scripts")),
          {
            repositoryRoot: windowsRoot,
          },
        );
        return yield* preview(planned, [], windowsRoot);
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            Layer.mergeAll(
              BlueprintService.layer,
              PlanService.layer,
              ApplyWorkspaces.layer,
            ),
            hostLayer,
          ),
        ),
      );

      assert.deepStrictEqual(result.apply.failed, []);
      assert.deepStrictEqual(result.apply.modified, paths("package.json"));
      assert.deepStrictEqual(
        decodeJson(
          result.files.find((file) => file.path === "package.json")?.contents,
        ),
        {
          name: "windows-app",
          scripts: { dev: "vite" },
        },
      );
      assert.strictEqual(
        yield* hostFileSystem.readFileString(hostManifest),
        original,
      );
    }),
  );

  it.effect("should recheck the host repository before materializing", () =>
    Effect.gen(function* () {
      yield* writeFiles({});
      const planned = yield* plan(app("pair"));
      const workspaces = yield* ApplyWorkspaces;
      const workspace = yield* workspaces.fromRepository({
        repositoryRoot,
        baseline: planned.baseline,
      });
      yield* writeFiles({ "packages/app/src/a.txt": "user content" });

      const failure = yield* Effect.flip(
        workspace.materialize(new Apply({ plan: planned, decisions: [] })),
      );

      assert(failure._tag === "StalePlanFailure");
      assert.deepInclude(failure.changes, {
        path: "packages/app/src/a.txt",
        kind: "created",
      });
      assert.strictEqual(
        yield* readFile("packages/app/src/a.txt"),
        "user content",
      );
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should reject a host Plan with a different baseline even when it is current",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const seeded = yield* plan(app("pair"));
        const other = yield* plan(app("tsconfig"));
        const workspaces = yield* ApplyWorkspaces;
        const workspace = yield* workspaces.fromRepository({
          repositoryRoot,
          baseline: seeded.baseline,
        });

        const failure = yield* Effect.flip(
          workspace.materialize(new Apply({ plan: other, decisions: [] })),
        );

        assert.strictEqual(failure._tag, "ApplyFailure");
        assert.isFalse(yield* exists(tsconfig));
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should materialize a Plan built in a seeded workspace without writing to the host",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const seeded = yield* plan(app("pair"));
        const workspaces = yield* ApplyWorkspaces;
        const blueprints = yield* BlueprintService;
        const workspace = yield* workspaces.fromRepository({
          repositoryRoot,
          baseline: seeded.baseline,
        });

        const planned = yield* workspace.plan({
          blueprint: yield* blueprints.resolve(app("pair"), config),
          config,
        });
        const result = yield* workspace.materialize(
          new Apply({ plan: planned, decisions: [] }),
        );

        assert.notStrictEqual(planned.baseline.root, repositoryRoot);
        assert.deepStrictEqual(result.apply.failed, []);
        assert.deepStrictEqual(
          result.files.map((file) => file.contents),
          ["A\n", "B\n"],
        );
        assert.isFalse(yield* exists("packages/app"));
      }).pipe(Effect.provide(testPipeline)),
  );
});
