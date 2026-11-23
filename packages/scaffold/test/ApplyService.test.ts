import { assert, describe, it } from "@effect/vitest";
import { RepositoryPath } from "@repo/domain/Plan";
import { Effect } from "effect";
import {
  app,
  apply,
  decideAll,
  exists,
  paths,
  plan,
  readFile,
  repositoryRoot,
  withFault,
  writeFiles,
  testPipeline,
} from "./fixtures/scaffold";

const tsconfig = "packages/app/tsconfig.json";
const barrel = "packages/app/src/index.ts";
const manifest = "packages/app/package.json";
const appFile = "packages/app/src/App.tsx";
const optionsFile = "packages/app/src/Options.ts";

/** Plans and applies a selection, failing on any conflict or failed write. */
const planAndApply = (...modules: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const planned = yield* plan(app(...modules));
    assert.deepStrictEqual(planned.conflicts, []);
    const result = yield* apply(planned);
    assert.deepStrictEqual(result.failed, []);
    return result;
  });

const count = (contents: string, pattern: RegExp) =>
  contents.match(pattern)?.length ?? 0;

describe("ApplyService", () => {
  it.effect("should write every created file and report its path", () =>
    Effect.gen(function* () {
      yield* writeFiles({});
      const result = yield* apply(yield* plan(app("api", "pair")));

      assert.deepStrictEqual(
        result.created,
        paths(
          "packages/app/src/Api.ts",
          "packages/app/src/a.txt",
          "packages/app/src/b.txt",
          barrel,
        ),
      );
      assert.deepStrictEqual(result.failed, []);
      assert.strictEqual(yield* readFile("packages/app/src/b.txt"), "B\n");
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should skip every path when the repository already matches", () =>
    Effect.gen(function* () {
      yield* writeFiles({});
      yield* apply(yield* plan(app("api")));

      const result = yield* apply(yield* plan(app("api")));

      assert.deepStrictEqual(result.created, []);
      assert.deepStrictEqual(result.modified, []);
      assert.deepStrictEqual(
        result.skipped,
        paths("packages/app/src/Api.ts", barrel),
      );
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should report sorted skipped paths when a modified file is written unchanged",
    () =>
      Effect.gen(function* () {
        const formatted =
          '{\n  "name": "@repo/app",\n  "scripts": {\n    "dev": "vite"\n  }\n}\n';
        yield* writeFiles({
          [manifest]: formatted,
          "packages/app/src/a.txt": "A\n",
          "packages/app/src/b.txt": "B\n",
        });
        const planned = yield* plan(app("manifest", "pair"));
        assert.strictEqual(
          planned.outcomes.find((outcome) => outcome.path === manifest)
            ?.classification,
          "modify",
        );

        const result = yield* apply(planned);

        assert.deepStrictEqual(result.modified, []);
        assert.deepStrictEqual(
          result.skipped,
          paths(manifest, "packages/app/src/a.txt", "packages/app/src/b.txt"),
        );
        assert.strictEqual(yield* readFile(manifest), formatted);
      }).pipe(Effect.provide(testPipeline)),
  );

  for (const { decision, contents, status } of [
    { decision: "skip", contents: "{}\n", status: "skipped" },
    {
      decision: "override",
      contents: '{ "extends": "../../tsconfig.base.json" }\n',
      status: "modified",
    },
  ] as const) {
    it.effect(`should honor a ${decision} decision for a conflict`, () =>
      Effect.gen(function* () {
        yield* writeFiles({ [tsconfig]: "{}\n" });
        const planned = yield* plan(app("tsconfig"));

        const result = yield* apply(planned, decideAll(planned, decision));

        assert.deepStrictEqual(result[status], paths(tsconfig));
        assert.strictEqual(yield* readFile(tsconfig), contents);
      }).pipe(Effect.provide(testPipeline)),
    );
  }

  for (const { name, path, decisions } of [
    { name: "a conflict has no decision", path: tsconfig, decisions: [] },
    {
      name: "decisions repeat a path",
      path: tsconfig,
      decisions: ["override", "skip"],
    },
    {
      name: "a decision names a path without a conflict",
      path: "packages/app/src/a.txt",
      decisions: ["override"],
    },
  ] as const) {
    it.effect(`should reject the Apply before writing when ${name}`, () =>
      Effect.gen(function* () {
        yield* writeFiles({ [tsconfig]: "{}\n" });
        const planned = yield* plan(app("tsconfig", "pair"));

        const failure = yield* Effect.flip(
          apply(
            planned,
            decisions.map((value) => ({
              path: RepositoryPath.make(path),
              value,
            })),
          ),
        );

        assert.strictEqual(failure._tag, "ApplyFailure");
        assert.include(failure.message, path);
        assert.strictEqual(yield* readFile(tsconfig), "{}\n");
        assert.isFalse(yield* exists("packages/app/src/a.txt"));
      }).pipe(Effect.provide(testPipeline)),
    );
  }

  for (const { name, existing, expected } of [
    {
      name: "create a missing barrel",
      existing: undefined,
      expected: 'export * from "./Api";\n',
    },
    {
      name: "extend an existing barrel",
      existing: 'export * from "./Existing";\n',
      expected: 'export * from "./Existing";\nexport * from "./Api";\n',
    },
  ]) {
    it.effect(`should compose re-exports to ${name}`, () =>
      Effect.gen(function* () {
        yield* writeFiles(existing === undefined ? {} : { [barrel]: existing });

        const result = yield* apply(yield* plan(app("api")));

        assert.deepStrictEqual(result.failed, []);
        assert.strictEqual(yield* readFile(barrel), expected);
      }).pipe(Effect.provide(testPipeline)),
    );
  }

  for (const { name, modules, path, contents, identifier } of [
    {
      name: "a call target is missing",
      modules: ["command", "pair"],
      path: "packages/app/src/main.ts",
      contents: "export const x = 1;\n",
      identifier: "Command.withSubcommands",
    },
    {
      name: "a JSX slot marker is missing",
      modules: ["card-slot", "pair"],
      path: appFile,
      contents: "export const App = () => <main />;\n",
      identifier: "@slot:components",
    },
    ...['"input"', '["input"]'].map((key) => ({
      name: `object field ${key} already has a different value`,
      modules: ["options-field", "pair"],
      path: optionsFile,
      contents: `const Options = Schema.Struct({ ${key}: Schema.String });\n`,
      identifier: "Options.input",
    })),
    {
      name: "a manifest section is not an object",
      modules: ["scripts", "pair"],
      path: manifest,
      contents: '{"name":"@repo/app","scripts":"vite dev"}',
      identifier: '"scripts"',
    },
  ]) {
    it.effect(`should fail before writing when ${name}`, () =>
      Effect.gen(function* () {
        yield* writeFiles({ [path]: contents });
        const planned = yield* plan(app(...modules));

        const failure = yield* Effect.flip(
          apply(planned, decideAll(planned, "override")),
        );

        assert.strictEqual(failure._tag, "ApplyFailure");
        assert.include(failure.message, identifier);
        assert.strictEqual(yield* readFile(path), contents);
        assert.isFalse(yield* exists("packages/app/src/a.txt"));
      }).pipe(Effect.provide(testPipeline)),
    );
  }

  it.effect(
    "should fail before writing when a file to compose cannot be read",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({ [barrel]: 'export * from "./Existing";\n' });
        const planned = yield* plan(app("api"));
        // The first read checks the barrel against the Plan baseline.
        const fault = yield* withFault({
          method: "readFile",
          path: `${repositoryRoot}/${barrel}`,
          skip: 1,
        });

        const failure = yield* Effect.flip(fault.provide(apply(planned)));

        assert.isTrue(yield* fault.fired);
        assert.strictEqual(failure._tag, "ApplyFailure");
        assert.include(failure.message, barrel);
        assert.isFalse(yield* exists("packages/app/src/Api.ts"));
        assert.strictEqual(
          yield* readFile(barrel),
          'export * from "./Existing";\n',
        );
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should record a failed write and continue below a newly created directory",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const planned = yield* plan(app("pair"));
        const fault = yield* withFault({
          method: "rename",
          path: `${repositoryRoot}/packages/app/src/a.txt`,
        });

        const result = yield* fault.provide(apply(planned));

        assert.isTrue(yield* fault.fired);
        assert.deepStrictEqual(result.created, paths("packages/app/src/b.txt"));
        assert.deepStrictEqual(
          result.failed.map((entry) => entry.path),
          ["packages/app/src/a.txt"],
        );
        assert.isFalse(yield* exists("packages/app/src/a.txt"));
        assert.strictEqual(yield* readFile("packages/app/src/b.txt"), "B\n");
      }).pipe(Effect.provide(testPipeline)),
  );

  describe("when composing TypeScript", () => {
    it.effect(
      "should keep slot contributions in order and apply them once",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({
            [appFile]:
              "export const App = () => (\n  <main>\n    {/* @slot:components */}\n  </main>\n);\n",
          });
          yield* planAndApply("alpha-slot", "beta-slot");
          const once = yield* readFile(appFile);

          const repeated = yield* planAndApply("alpha-slot", "beta-slot");

          assert.isBelow(once.indexOf("<Alpha />"), once.indexOf("<Beta />"));
          assert.deepStrictEqual(repeated.skipped, paths(appFile));
          const twice = yield* readFile(appFile);
          assert.strictEqual(twice, once);
          assert.strictEqual(count(twice, /<Alpha \/>/g), 1);
          assert.strictEqual(count(twice, /<Beta \/>/g), 1);
          assert.strictEqual(count(twice, /from "\.\/cards"/g), 1);
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect("should apply slot content in a JSX fragment once", () =>
      Effect.gen(function* () {
        yield* writeFiles({
          [appFile]:
            "export const App = () => (\n  <>\n    {/* @slot:components */}\n  </>\n);\n",
        });
        yield* planAndApply("card-slot");
        const once = yield* readFile(appFile);

        yield* planAndApply("card-slot");

        assert.strictEqual(yield* readFile(appFile), once);
        assert.strictEqual(count(once, /<Card \/>/g), 1);
      }).pipe(Effect.provide(testPipeline)),
    );

    for (const { name, module, existing } of [
      {
        name: "outside the slot",
        module: "card-slot",
        existing:
          "export const App = () => (\n  <>\n    <main>\n      {/* @slot:components */}\n    </main>\n    <aside><Card /></aside>\n  </>\n);\n",
      },
      {
        name: "after the next sibling slot",
        module: "first-card-slot",
        existing:
          "export const App = () => (\n  <main>\n    {/* @slot:first */}\n    {/* @slot:second */}\n    <Card />\n  </main>\n);\n",
      },
    ]) {
      it.effect(
        `should insert slot content when matching content is ${name}`,
        () =>
          Effect.gen(function* () {
            yield* writeFiles({ [appFile]: existing });
            yield* planAndApply(module);

            const written = yield* readFile(appFile);
            assert.strictEqual(count(written, /<Card \/>/g), 2);
            assert.isBelow(
              written.indexOf("<Card />"),
              written.lastIndexOf("<Card />"),
            );
            if (module === "first-card-slot") {
              assert.isBelow(
                written.indexOf("<Card />"),
                written.indexOf("{/* @slot:second */}"),
              );
            }
          }).pipe(Effect.provide(testPipeline)),
      );
    }

    it.effect(
      "should repeat a deeply nested object field and reject a change within it",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({
            [optionsFile]: "const Options = Schema.Struct({});\n",
          });
          yield* planAndApply("nested-string-field");
          const once = yield* readFile(optionsFile);

          const repeated = yield* planAndApply("nested-string-field");
          const changed = yield* Effect.flip(
            Effect.flatMap(plan(app("nested-number-field")), (planned) =>
              apply(planned),
            ),
          );

          assert.deepStrictEqual(repeated.skipped, paths(optionsFile));
          assert.strictEqual(changed._tag, "ApplyFailure");
          assert.include(changed.message, "Options.input");
          assert.strictEqual(yield* readFile(optionsFile), once);
        }).pipe(Effect.provide(testPipeline)),
    );
  });
});
