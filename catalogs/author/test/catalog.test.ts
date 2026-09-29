import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";
import { buildAuthorCatalog, exportAuthorCatalog } from "../src/service";

const readRelative = (url: URL) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(yield* path.fromFileUrl(url));
  }).pipe(Effect.provide(NodeServices.layer));

const contentsOf = (path: string) =>
  buildAuthorCatalog.pipe(
    Effect.map(({ document }) =>
      [...document.targets, ...document.modules]
        .flatMap((definition) => definition.contributions)
        .flatMap((contribution) =>
          contribution._tag === "file" && contribution.path === path
            ? [contribution.contents]
            : [],
        ),
    ),
  );

const PackageJson = Schema.fromJsonString(
  Schema.Struct({
    peerDependencies: Schema.optional(
      Schema.Record(Schema.String, Schema.String),
    ),
  }),
);

describe("author catalog", () => {
  it.effect("builds the published author catalog byte for byte", () =>
    Effect.gen(function* () {
      const golden = yield* readRelative(
        new URL("./author.golden.json", import.meta.url),
      );
      assert.strictEqual(yield* exportAuthorCatalog, golden);
    }),
  );

  it.effect("publishes only its own definitions and requires official", () =>
    Effect.gen(function* () {
      const { document } = yield* buildAuthorCatalog;
      assert.deepStrictEqual(document.requires, ["official"]);
      assert.deepStrictEqual(
        document.targets.map((target) => target.kind),
        ["catalog"],
      );
      assert.deepStrictEqual(
        document.modules.map((module) => module.id),
        ["catalog-starter"],
      );
    }),
  );

  it.effect("generates no import of this repository's packages", () =>
    Effect.gen(function* () {
      const json = yield* exportAuthorCatalog;
      // The only @repo package is the generated workspace's own TS config.
      const references = [...json.matchAll(/@repo\/[a-z-]+/g)].map(
        ([match]) => match,
      );
      assert.deepStrictEqual(
        [...new Set(references)],
        ["@repo/config-typescript"],
      );
    }),
  );

  it.effect(
    "pins Effect packages to the peer the author package requires",
    () =>
      Effect.gen(function* () {
        const author = yield* Schema.decodeEffect(PackageJson)(
          yield* readRelative(
            new URL("../../../packages/author/package.json", import.meta.url),
          ),
        );
        const [template] = yield* contentsOf("{{targetPath}}/package.json");
        assert.isDefined(template);
        const pins = [
          ...template.matchAll(
            /"((?:@effect\/[^"]+)|effect|\{\{[^"]+)": "([^"]+)"/g,
          ),
        ].map(([, , version]) => version);
        assert.isNotEmpty(pins);
        assert.deepStrictEqual(
          [...new Set(pins)],
          [author.peerDependencies?.["effect"]],
        );
      }),
  );
});

describe("nested tool configs", () => {
  // Formatters use the nearest config without merging, so the catalog target
  // repeats the workspace options. These copies must follow the official ones.
  const official = (path: string) =>
    new URL(`../../official/templates/${path}`, import.meta.url);
  const author = (path: string) =>
    new URL(`../templates/catalog/${path}`, import.meta.url);

  it.effect("repeats the official oxfmt options and skips templates", () =>
    Effect.gen(function* () {
      const expected = (yield* readRelative(
        official("workspace-quality-oxfmt/_oxfmtrc.jsonc"),
      ))
        .replace("./node_modules/", "../../node_modules/")
        .replace(
          '"**/.turbo/**"\n  ]\n}',
          '"**/.turbo/**",\n    "templates/**",\n  ],\n}',
        );
      const actual = (yield* readRelative(author("_oxfmtrc.jsonc")))
        .split("\n")
        .filter((line) => !line.startsWith("//"))
        .join("\n");
      assert.strictEqual(actual, expected);
    }),
  );

  it.effect("repeats the official dprint config and skips templates", () =>
    Effect.gen(function* () {
      const Config = Schema.fromJsonString(
        Schema.StructWithRest(
          Schema.Struct({ excludes: Schema.Array(Schema.String) }),
          [Schema.Record(Schema.String, Schema.Unknown)],
        ),
      );
      const decode = Schema.decodeEffect(Config);
      const expected = yield* decode(
        yield* readRelative(official("workspace-quality-dprint/dprint.json")),
      );
      const actual = yield* decode(yield* readRelative(author("dprint.json")));
      assert.deepStrictEqual(actual, {
        ...expected,
        excludes: [...expected.excludes, "templates/**"],
      });
    }),
  );
});

// Git and the repository's formatter and linter read these names in nested
// directories. Store templates under them with a leading underscore instead.
const toolControlled = new Set([
  ".gitignore",
  ".gitattributes",
  ".eslintignore",
  ".oxfmtrc.json",
  ".oxfmtrc.jsonc",
  ".oxlintrc.json",
  ".editorconfig",
]);

it.effect("stores no template under a name repository tools interpret", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files = yield* fs.readDirectory(
      yield* path.fromFileUrl(new URL("../templates/", import.meta.url)),
      { recursive: true },
    );
    assert.isNotEmpty(files);
    assert.deepStrictEqual(
      files.filter((file) => toolControlled.has(path.basename(file))),
      [],
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);
