import { it } from "@effect/vitest";
import { CatalogDocument } from "@repo/domain/Catalog";
import { STACK_CONFIG_SCHEMA_URL } from "@repo/domain/Scaffold";
import Ajv2020 from "ajv/dist/2020.js";
import { Effect, Option, Schema } from "effect";
import { describe, expect } from "vitest";
import {
  AUTHOR_CATALOG_ASSET_PATH,
  CATALOG_ASSET_PATH,
  CONFIG_SCHEMA_ASSET_PATH,
  generateCatalogRegistryAssets,
  publishableCatalog,
  type PublishedCatalog,
} from "../scripts/catalog-registry-assets";
import publishedAuthorIds from "./fixtures/published-author-catalog-ids.json";
import publishedIds from "./fixtures/published-catalog-ids.json";

describe("catalog registry assets", () => {
  it.effect.each([
    { asset: CATALOG_ASSET_PATH, ids: publishedIds },
    { asset: AUTHOR_CATALOG_ASSET_PATH, ids: publishedAuthorIds },
  ] as const)(
    "should still publish every previously published identifier when $asset is generated",
    ({ asset, ids }) =>
      Effect.gen(function* () {
        const assets = yield* generateCatalogRegistryAssets();
        const catalog = yield* Schema.decodeEffect(
          Schema.fromJsonString(CatalogDocument),
        )(assets[asset]);

        // New identifiers may appear; a published one must never disappear.
        expect(catalog.targets.map((target) => target.kind)).toEqual(
          expect.arrayContaining(ids.targets),
        );
        expect(catalog.modules.map((module) => module.id)).toEqual(
          expect.arrayContaining(ids.modules),
        );
      }),
  );

  it.effect(
    "should accept old and annotated configurations when validated with the hosted Draft 2020-12 schema",
    () =>
      Effect.gen(function* () {
        const assets = yield* generateCatalogRegistryAssets();
        const schema = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
        )(assets[CONFIG_SCHEMA_ASSET_PATH]);
        const validate = new Ajv2020().compile(schema);
        const old = { name: "old-project", runtime: { _tag: "bun" } };

        expect(schema).toMatchObject({
          $id: STACK_CONFIG_SCHEMA_URL,
          $schema: "https://json-schema.org/draft/2020-12/schema",
        });
        expect(validate(old)).toBe(true);
        expect(validate({ $schema: STACK_CONFIG_SCHEMA_URL, ...old })).toBe(
          true,
        );
        expect(validate({ ...old, runtime: { _tag: "unknown" } })).toBe(false);
      }),
  );

  const example: PublishedCatalog = {
    asset: CATALOG_ASSET_PATH,
    workspace: "catalogs/example",
    build: new URL("file:///catalogs/example/dist/catalog.json"),
  };
  const expected = '{"formatVersion":1}\n';

  it.effect(
    "should publish the build when it matches the current catalog",
    () =>
      Effect.gen(function* () {
        expect(
          yield* publishableCatalog(example, Option.some(expected), expected),
        ).toBe(expected);
      }),
  );

  it.effect(
    "should name the workspace to build when its build is missing",
    () =>
      Effect.gen(function* () {
        const missing = yield* Effect.flip(
          publishableCatalog(example, Option.none(), expected),
        );
        expect(missing._tag).toBe("CatalogBuildMissing");
        expect(missing.message).toContain(example.workspace);
      }),
  );

  it.effect("should refuse to publish a build when it is stale", () =>
    Effect.gen(function* () {
      const stale = yield* Effect.flip(
        publishableCatalog(
          example,
          Option.some('{"formatVersion":0}\n'),
          expected,
        ),
      );
      expect(stale._tag).toBe("CatalogBuildStale");
    }),
  );
});
