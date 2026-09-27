import { assert, it } from "@effect/vitest";
import {
  CatalogDocument,
  TargetIdentity,
  TargetKind,
  TargetKey,
} from "@repo/domain/Catalog";
import { ContributionTokenContext, StackConfig } from "@repo/domain/Scaffold";
import { Effect, Schema } from "effect";
import { bundledCatalog, exportOfficialCatalog } from "./authoring";
import {
  decodeCatalogDocument,
  validateCatalogCapabilities,
} from "./CatalogProtocol";
import { composeCatalog } from "./composeCatalog";

it.effect(
  "exports and decodes every official definition with TargetIdentity behavior",
  () =>
    Effect.gen(function* () {
      const json = yield* exportOfficialCatalog();
      const document = yield* Schema.decodeEffect(
        Schema.fromJsonString(CatalogDocument),
      )(json);
      assert.strictEqual(document.formatVersion, 1);
      assert.strictEqual(
        document.targets.length,
        bundledCatalog.targets.length,
      );
      assert.strictEqual(
        document.modules.length,
        bundledCatalog.modules.length,
      );
      const dependency = document.modules
        .flatMap((module) => module.dependencies)
        .find((item) => item._tag === "required-module");
      assert.isDefined(dependency);
      assert.strictEqual(dependency._tag, "required-module");
      assert.instanceOf(dependency.target, TargetIdentity);
      assert.isTrue(dependency.target.toKey().length > 0);
      const encoded = yield* Schema.encodeEffect(
        Schema.fromJsonString(CatalogDocument),
      )(document);
      assert.strictEqual(encoded, json.trim());
    }),
);

it.effect("refuses an interpreter capability outside the fixed v1 set", () =>
  Effect.gen(function* () {
    const document = yield* Schema.decodeEffect(
      Schema.fromJsonString(CatalogDocument),
    )(yield* exportOfficialCatalog());
    const failure = yield* Effect.flip(
      validateCatalogCapabilities({
        ...document,
        requiredCapabilities: [
          ...document.requiredCapabilities,
          "token:unknown",
        ],
      }),
    );
    assert.include(failure.capabilities, "token:unknown");
  }),
);

it.effect("refuses a new template token even when metadata omits it", () =>
  Effect.gen(function* () {
    const document = yield* Schema.decodeEffect(
      Schema.fromJsonString(CatalogDocument),
    )(yield* exportOfficialCatalog());
    const first = document.modules[0];
    assert.isDefined(first);
    const failure = yield* Effect.flip(
      validateCatalogCapabilities({
        ...document,
        modules: [
          ...document.modules.slice(1),
          {
            ...first,
            contributions: [
              ...first.contributions,
              { _tag: "file", path: "extra.txt", contents: "{{unknown}}" },
            ],
          },
        ],
      }),
    );
    assert.include(failure.capabilities, "token:unknown");
  }),
);

it.effect("refuses template forms the renderer leaves unresolved", () =>
  Effect.gen(function* () {
    const document = yield* Schema.decodeEffect(
      Schema.fromJsonString(CatalogDocument),
    )(yield* exportOfficialCatalog());
    const first = document.modules[0];
    assert.isDefined(first);
    const context = new ContributionTokenContext({
      targetKey: TargetKey.make("apps/server-api"),
      identity: new TargetIdentity({
        kind: TargetKind.make("server"),
        name: "api",
      }),
      config: new StackConfig({
        name: Schema.NonEmptyString.make("my-project"),
        runtime: { _tag: "bun" },
      }),
    });
    for (const contents of [
      "{{ runtime }}",
      "{{#if runtime =bun}}bun{{/if}}",
      "{{#if runtime=bun}}bun",
      "bun{{/if}}",
      "{{#if runtime=bun}}{{#if lint}}nested{{/if}}{{/if}}",
    ]) {
      assert.match(context.resolve(contents), /\{\{/);
      const failure = yield* Effect.flip(
        validateCatalogCapabilities({
          ...document,
          modules: [
            ...document.modules.slice(1),
            {
              ...first,
              contributions: [
                ...first.contributions,
                { _tag: "file", path: "extra.txt", contents },
              ],
            },
          ],
        }),
      );
      assert.isAbove(failure.capabilities.length, 0);
    }
  }),
);

it.effect(
  "does not match conditional delimiters across file contributions",
  () =>
    Effect.gen(function* () {
      const document = yield* Schema.decodeEffect(
        Schema.fromJsonString(CatalogDocument),
      )(yield* exportOfficialCatalog());
      const first = document.modules[0];
      assert.isDefined(first);
      const failure = yield* Effect.flip(
        validateCatalogCapabilities({
          ...document,
          modules: [
            ...document.modules.slice(1),
            {
              ...first,
              contributions: [
                ...first.contributions,
                {
                  _tag: "file",
                  path: "open.txt",
                  contents: "{{#if runtime=bun}}",
                },
                { _tag: "file", path: "close.txt", contents: "{{/if}}" },
              ],
            },
          ],
        }),
      );
      assert.include(failure.capabilities, "syntax:malformed-template");
    }),
);

it.effect("decodes a source before cross-source references are composed", () =>
  Effect.gen(function* () {
    const official = yield* Schema.decodeEffect(
      Schema.fromJsonString(CatalogDocument),
    )(yield* exportOfficialCatalog());
    const module = official.modules.find((item) =>
      item.dependencies.some(
        (dependency) => dependency._tag === "required-module",
      ),
    );
    assert.isDefined(module);
    const encoded = yield* Schema.encodeEffect(CatalogDocument)({
      ...official,
      targets: [],
      modules: [module],
    });
    const fragment = yield* decodeCatalogDocument(encoded);
    assert.strictEqual(fragment.modules.length, 1);
    const error = yield* Effect.flip(composeCatalog([fragment]));
    assert.isAbove(error.issues.length, 0);
  }),
);
