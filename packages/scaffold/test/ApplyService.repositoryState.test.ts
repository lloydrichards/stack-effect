import { assert, describe, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { RepositoryPath } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, FileSystem, Schema } from "effect";
import {
  app,
  apply,
  decideAll,
  exists,
  paths,
  pipelineLayer,
  plan,
  preview,
  readFile,
  repositoryRoot,
  selected,
  selection,
  withFault,
  writeFiles,
  testPipeline,
} from "./fixtures/scaffold";

const officialLayer = pipelineLayer(OfficialCatalogLayer);

const domain = selection(selected("package", "domain", "domain-api-contracts"));
const build = plan(domain);

const packages = (...names: ReadonlyArray<string>) =>
  selection(...names.map((name) => selected("package", name)));

const ownerManifest = (directory: string, name: string) =>
  writeFiles({ [`${directory}/package.json`]: JSON.stringify({ name }) });

const decodeRecord = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
);

describe("Plan and Apply repository state", () => {
  for (const runtime of [
    { _tag: "deno" },
    { _tag: "node", packageManager: "pnpm" },
  ] as const) {
    it.effect(
      `should preserve ${runtime._tag} workspace settings when nested packages are added incrementally`,
      () =>
        Effect.gen(function* () {
          yield* ownerManifest("packages/helper", "@repo/helper");
          yield* writeFiles({
            "packages/helper/templates/workspace/package.json": "{}",
            "package.json":
              '{"name":"project","workspaces":["apps/**","packages/**","tools/*"],"scripts":{"custom":"echo custom"}}',
            "deno.json":
              '{"workspace":["apps/**","packages/**"],"tasks":{"custom":"echo custom"}}',
            "pnpm-workspace.yaml":
              'packages:\n  - "apps/**"\n  - "packages/**"\n\nallowBuilds:\n  esbuild: true\n',
          });
          const configuration = new StackConfig({ name: "project", runtime });
          const planAt = (name: string) =>
            plan(
              selection(
                selected("workspace", configuration.name),
                selected("package", name),
              ),
              { config: configuration },
            );
          for (const name of ["sdk/client", "sdk/codecs"]) {
            const planned = yield* planAt(name);
            assert.deepStrictEqual(
              planned.conflicts.map((conflict) => conflict.path),
              name === "sdk/client" ? [] : ["README.md"],
            );
            const result = yield* apply(planned, decideAll(planned, "skip"));
            assert.deepStrictEqual(result.failed, []);
          }
          const members = [
            "packages/config-typescript",
            "packages/helper",
            "packages/sdk/client",
            "packages/sdk/codecs",
          ];
          const rootManifest = yield* decodeRecord(
            yield* readFile("package.json"),
          );
          assert.deepStrictEqual(rootManifest["workspaces"], [
            ...members,
            "tools/*",
          ]);
          assert.deepStrictEqual(rootManifest["scripts"], {
            custom: "echo custom",
          });
          const denoManifest = yield* decodeRecord(
            yield* readFile("deno.json"),
          );
          assert.deepStrictEqual(denoManifest["workspace"], members);
          assert.deepStrictEqual(denoManifest["tasks"], {
            custom: "echo custom",
          });
          const pnpm = yield* readFile("pnpm-workspace.yaml");
          assert.strictEqual(
            pnpm,
            `packages:\n${members.map((member) => `  - ${member}\n`).join("")}\nallowBuilds:\n  esbuild: true\n`,
          );

          const repeated = yield* planAt("sdk/codecs");
          const result = yield* apply(repeated, decideAll(repeated, "skip"));

          assert.deepStrictEqual(result.failed, []);
          assert.strictEqual(yield* readFile("pnpm-workspace.yaml"), pnpm);
          assert.include(
            yield* readFile("deno.json"),
            '"custom": "echo custom"',
          );
          assert.isTrue(
            repeated.outcomes
              .filter((outcome) =>
                ["package.json", "deno.json", "pnpm-workspace.yaml"].includes(
                  outcome.path,
                ),
              )
              .every((outcome) => outcome.classification === "unchanged"),
          );
        }).pipe(Effect.provide(officialLayer)),
    );
  }

  for (const [directory, name] of [
    ["packages/domain", "@repo/other"],
    ["packages/domain/client", "@repo/client"],
    ["packages/other", "@repo/domain"],
    ["packages/Domain", "@repo/other"],
    ["packages", "@repo/sdk"],
  ] as const) {
    it.effect(
      `should reject placement without writes when ${directory} belongs to ${name}`,
      () =>
        Effect.gen(function* () {
          yield* ownerManifest(directory, name);

          const failure = yield* Effect.flip(build);

          assert.strictEqual(failure._tag, "PlanFailure");
          assert.include(failure.message, directory);
          assert.isFalse(yield* exists("packages/domain/src/Api.ts"));
        }).pipe(Effect.provide(officialLayer)),
    );
  }

  for (const symbolic of [false, true]) {
    it.effect(
      `should reject discovery when a grouping directory has ${symbolic ? "a symbolic link" : "a malformed manifest"}`,
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          if (symbolic) {
            yield* files.makeDirectory(`${repositoryRoot}/packages`, {
              recursive: true,
            });
            yield* files.symlink(
              "/missing-group",
              `${repositoryRoot}/packages/sdk`,
            );
          } else {
            yield* writeFiles({ "packages/sdk/package.json": "invalid json" });
          }

          const failure = yield* Effect.flip(build);

          assert.strictEqual(failure._tag, "PlanFailure");
        }).pipe(Effect.provide(officialLayer)),
    );
  }

  it.effect(
    "should preserve existing files when sdk/client aliases sdk-client",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        yield* apply(yield* plan(packages("sdk-client")));
        const original = yield* readFile("packages/sdk-client/package.json");

        const failure = yield* Effect.flip(plan(packages("sdk/client")));

        assert.strictEqual(failure._tag, "PlanFailure");
        assert.strictEqual(
          yield* readFile("packages/sdk-client/package.json"),
          original,
        );
        assert.isFalse(yield* exists("packages/sdk/client/src/index.ts"));
      }).pipe(Effect.provide(officialLayer)),
  );

  it.effect(
    "should complete later writes when a new owner contains an internal template manifest",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});

        const result = yield* apply(
          yield* plan(app("manifest", "template-manifest", "pair")),
        );

        assert.deepStrictEqual(result.failed, []);
        assert.strictEqual(yield* readFile("packages/app/src/b.txt"), "B\n");
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should ignore internal manifests and symlinks when adding beside an existing owner",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* ownerManifest("packages/helper", "@repo/helper");
        yield* ownerManifest("packages/helper/dist", "@repo/helper");
        yield* writeFiles({
          "packages/helper/tests/fixtures/package.json": "{}",
        });
        yield* files.symlink(
          "/missing-source",
          `${repositoryRoot}/packages/helper/source-link`,
        );

        const planned = yield* build;
        const result = yield* apply(planned);

        assert.deepStrictEqual(planned.baseline.packageOwners, [
          {
            path: RepositoryPath.make("packages/helper"),
            name: "@repo/helper",
          },
        ]);
        assert.deepStrictEqual(result.failed, []);
        assert.include(
          result.created,
          RepositoryPath.make("packages/domain/package.json"),
        );
      }).pipe(Effect.provide(officialLayer)),
  );

  for (const change of ["removed", "renamed", "discovered"] as const) {
    it.effect(
      `should reject Apply when a helper owner is ${change} after planning`,
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          const discovered = change === "discovered";
          yield* ownerManifest(
            discovered ? "packages/unrelated" : "packages/helper",
            discovered ? "@repo/unrelated" : "@repo/helper",
          );
          const planned = yield* build;
          yield* change === "removed"
            ? files.remove(`${repositoryRoot}/packages/helper/package.json`)
            : ownerManifest(
                "packages/helper",
                discovered ? "@repo/helper" : "@repo/changed",
              );

          const failure = yield* Effect.flip(apply(planned));

          assert(failure._tag === "StalePlanFailure");
          assert.deepStrictEqual(failure.partialResult.created, []);
        }).pipe(Effect.provide(officialLayer)),
    );
  }

  it.effect("should plan and apply beneath a missing repository root", () =>
    Effect.gen(function* () {
      const root = "/future/repo";
      const planned = yield* plan(app("pair"), { repositoryRoot: root });
      assert.strictEqual(planned.baseline.root, root);

      const previewed = yield* preview(planned, [], root);
      assert.isAbove(previewed.files.length, 0);
      assert.isFalse(yield* exists(".", root));

      const result = yield* apply(planned, [], root);
      assert.isAbove(result.created.length, 0);
      assert.isTrue(yield* exists(".", root));
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should accept an alias that resolves to the planned root", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* writeFiles({});
      yield* files.symlink(repositoryRoot, "/alias");
      const planned = yield* plan(app("pair"));

      const result = yield* preview(planned, [], "/alias");

      assert.deepStrictEqual(result.apply.failed, []);
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should reject non-text contents at a planned path", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* writeFiles({ "packages/app/src/.keep": "" });
      yield* files.writeFile(
        `${repositoryRoot}/packages/app/src/a.txt`,
        Uint8Array.of(0xff, 0x00),
      );

      const failure = yield* Effect.flip(plan(app("pair")));

      assert.strictEqual(failure._tag, "PlanFailure");
      assert.include(failure.message, "packages/app/src/a.txt");
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should reject a symbolic link at a planned path", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* writeFiles({ "packages/app/src/.keep": "" });
      yield* files.writeFileString("/external.txt", "external");
      yield* files.symlink(
        "/external.txt",
        `${repositoryRoot}/packages/app/src/a.txt`,
      );

      const failure = yield* Effect.flip(plan(app("pair")));

      assert.strictEqual(failure._tag, "PlanFailure");
      assert.include(failure.message, "packages/app/src/a.txt");
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should reject a newly created planned path before preview or Apply",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const planned = yield* plan(app("pair"));
        yield* writeFiles({ "packages/app/src/a.txt": "private new content" });

        const previewFailure = yield* Effect.flip(preview(planned));
        const applyFailure = yield* Effect.flip(apply(planned));

        assert(previewFailure._tag === "StalePlanFailure");
        assert.deepInclude(previewFailure.changes, {
          path: "packages/app/src/a.txt",
          kind: "created",
        });
        assert.notInclude(previewFailure.message, "private new content");
        assert(applyFailure._tag === "StalePlanFailure");
        assert.deepStrictEqual(applyFailure.partialResult.created, []);
        assert.strictEqual(
          yield* readFile("packages/app/src/a.txt"),
          "private new content",
        );
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should reject a different repository even when planned paths match",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        yield* writeFiles({}, "/other");
        const planned = yield* plan(app("pair"));

        const failure = yield* Effect.flip(preview(planned, [], "/other"));

        assert(failure._tag === "StalePlanFailure");
        assert.deepInclude(failure.changes, { path: ".", kind: "rootChanged" });
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should make a Plan stale after its first successful Apply", () =>
    Effect.gen(function* () {
      yield* writeFiles({});
      const planned = yield* plan(app("pair"));
      const first = yield* apply(planned);
      assert.isAbove(first.created.length, 0);

      const second = yield* Effect.flip(apply(planned));

      assert(second._tag === "StalePlanFailure");
      assert.deepStrictEqual(second.partialResult.created, []);
    }).pipe(Effect.provide(testPipeline)),
  );

  for (const { name, change, kind } of [
    {
      name: "changed contents",
      change: (original: string) => `private changed ${original}`,
      kind: "modified",
    },
    {
      name: "an added byte order mark",
      change: (original: string) => `﻿${original}`,
      kind: "modified",
    },
  ] as const) {
    it.effect(
      `should detect ${name} in an unchanged file and accept it once restored`,
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          yield* apply(yield* plan(app("pair")));
          const planned = yield* plan(app("pair"));
          const path = "packages/app/src/a.txt";
          const original = yield* readFile(path);
          yield* writeFiles({ [path]: change(original) });

          const failure = yield* Effect.flip(preview(planned));
          yield* writeFiles({ [path]: original });
          const restored = yield* preview(planned);

          assert(failure._tag === "StalePlanFailure");
          assert.deepInclude(failure.changes, {
            path: RepositoryPath.make(path),
            kind,
          });
          assert.notInclude(failure.message, "private changed");
          assert.deepStrictEqual(restored.apply.failed, []);
        }).pipe(Effect.provide(testPipeline)),
    );
  }

  it.effect("should reject deletion of an existing planned file", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* writeFiles({});
      yield* apply(yield* plan(app("pair")));
      const planned = yield* plan(app("pair"));
      yield* files.remove(`${repositoryRoot}/packages/app/src/a.txt`);

      const failure = yield* Effect.flip(preview(planned));

      assert(failure._tag === "StalePlanFailure");
      assert.deepInclude(failure.changes, {
        path: "packages/app/src/a.txt",
        kind: "deleted",
      });
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should report every preflight change, including an ancestor, before writing",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const planned = yield* plan(app("pair"));
        yield* writeFiles({ "packages/app/src/a.txt": "external content" });

        const failure = yield* Effect.flip(apply(planned));

        assert(failure._tag === "StalePlanFailure");
        for (const path of [
          "packages",
          "packages/app",
          "packages/app/src",
          "packages/app/src/a.txt",
        ]) {
          assert.deepInclude(failure.changes, { path, kind: "created" });
        }
        assert.deepStrictEqual(failure.partialResult.created, []);
        assert.deepStrictEqual(failure.partialResult.modified, []);
        assert.strictEqual(
          yield* readFile("packages/app/src/a.txt"),
          "external content",
        );
        assert.isFalse(yield* exists("packages/app/src/b.txt"));
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should treat a changed skipped conflict as a stale Plan", () =>
    Effect.gen(function* () {
      const tsconfig = "packages/app/tsconfig.json";
      yield* writeFiles({ [tsconfig]: "{}\n" });
      const planned = yield* plan(app("tsconfig", "pair"));
      yield* writeFiles({ [tsconfig]: '{"changed":true}\n' });

      const failure = yield* Effect.flip(
        apply(planned, decideAll(planned, "skip")),
      );

      assert(failure._tag === "StalePlanFailure");
      assert.deepInclude(failure.changes, { path: tsconfig, kind: "modified" });
      assert.deepStrictEqual(failure.partialResult.created, []);
      assert.strictEqual(yield* readFile(tsconfig), '{"changed":true}\n');
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should stop when a foreign owner appears during Apply", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* writeFiles({});
      const planned = yield* plan(app("manifest", "pair"));
      const fault = yield* withFault({
        method: "rename",
        path: `${repositoryRoot}/packages/app/package.json`,
        before: ownerManifest("packages/foreign", "@repo/foreign").pipe(
          Effect.provideService(FileSystem.FileSystem, files),
        ),
      });

      const failure = yield* Effect.flip(fault.provide(apply(planned)));

      assert.isTrue(yield* fault.fired);
      assert(failure._tag === "StalePlanFailure");
      assert.deepInclude(failure.changes, { path: ".", kind: "modified" });
      assert.deepStrictEqual(
        failure.partialResult.created,
        paths("packages/app/package.json"),
      );
      assert.isFalse(yield* exists("packages/app/src/a.txt"));
      assert.strictEqual(
        yield* readFile("packages/foreign/package.json"),
        '{"name":"@repo/foreign"}',
      );
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should stop with a partial result when a later path changes during Apply",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* writeFiles({});
        const planned = yield* plan(app("manifest", "pair"));
        const fault = yield* withFault({
          method: "rename",
          path: `${repositoryRoot}/packages/app/package.json`,
          before: writeFiles({
            "packages/app/src/a.txt": "external late drift",
          }).pipe(Effect.provideService(FileSystem.FileSystem, files)),
        });

        const failure = yield* Effect.flip(fault.provide(apply(planned)));

        assert.isTrue(yield* fault.fired);
        assert(failure._tag === "StalePlanFailure");
        assert.deepInclude(failure.changes, {
          path: "packages/app/src/a.txt",
          kind: "created",
        });
        assert.include(
          failure.partialResult.created,
          RepositoryPath.make("packages/app/package.json"),
        );
        assert.notInclude(
          failure.partialResult.created,
          RepositoryPath.make("packages/app/src/a.txt"),
        );
        assert.strictEqual(
          yield* readFile("packages/app/src/a.txt"),
          "external late drift",
        );
      }).pipe(Effect.provide(testPipeline)),
  );
});
