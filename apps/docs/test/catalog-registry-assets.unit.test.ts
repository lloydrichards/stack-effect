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
  publishedCatalogs,
} from "../scripts/catalog-registry-assets";
import publishedAuthorIds from "./fixtures/published-author-catalog-ids.json";
import publishedIds from "./fixtures/published-catalog-ids.json";

describe("catalog registry assets", () => {
  it.effect.each([
    { asset: CATALOG_ASSET_PATH, ids: publishedIds },
    { asset: AUTHOR_CATALOG_ASSET_PATH, ids: publishedAuthorIds },
  ] as const)("keeps every published identifier in $asset", ({ asset, ids }) =>
    Effect.gen(function* () {
      const assets = yield* generateCatalogRegistryAssets();
      const catalog = yield* Schema.decodeEffect(
        Schema.fromJsonString(CatalogDocument),
      )(assets[asset]);

      expect(catalog.targets.map((target) => target.kind)).toEqual(ids.targets);
      expect(catalog.modules.map((module) => module.id)).toEqual(ids.modules);
    }),
  );

  it.effect("publishes the author catalog as an extension of official", () =>
    Effect.gen(function* () {
      const assets = yield* generateCatalogRegistryAssets();
      const author = yield* Schema.decodeEffect(
        Schema.fromJsonString(CatalogDocument),
      )(assets[AUTHOR_CATALOG_ASSET_PATH]);
      expect(author.requires).toEqual(["official"]);
    }),
  );

  it.effect(
    "validates old and annotated configurations with the hosted Draft 2020-12 schema",
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

  it.effect.each(publishedCatalogs)(
    "publishes only a current build of $workspace",
    (catalog) =>
      Effect.gen(function* () {
        const expected = '{"formatVersion":1}\n';
        expect(
          yield* publishableCatalog(catalog, Option.some(expected), expected),
        ).toBe(expected);
        const missing = yield* Effect.flip(
          publishableCatalog(catalog, Option.none(), expected),
        );
        expect(missing._tag).toBe("CatalogBuildMissing");
        expect(missing.message).toContain(catalog.workspace);
        const stale = yield* Effect.flip(
          publishableCatalog(
            catalog,
            Option.some('{"formatVersion":0}\n'),
            expected,
          ),
        );
        expect(stale._tag).toBe("CatalogBuildStale");
      }),
  );
});
import { it } from "@effect/vitest";
