import { CatalogDocument } from "@repo/domain/Catalog";
import { STACK_CONFIG_SCHEMA_URL } from "@repo/domain/Scaffold";
import Ajv2020 from "ajv/dist/2020.js";
import { Effect, Option, Schema } from "effect";
import { describe, expect } from "vitest";
import {
  CATALOG_ASSET_PATH,
  CONFIG_SCHEMA_ASSET_PATH,
  generateCatalogRegistryAssets,
  publishableCatalog,
} from "../scripts/catalog-registry-assets";
import publishedIds from "./fixtures/published-catalog-ids.json";

describe("catalog registry assets", () => {
  it.effect("keeps every published target and module identifier", () =>
    Effect.gen(function* () {
      const assets = yield* generateCatalogRegistryAssets();
      const catalog = yield* Schema.decodeEffect(
        Schema.fromJsonString(CatalogDocument),
      )(assets[CATALOG_ASSET_PATH]);

      expect(catalog.targets.map((target) => target.kind)).toEqual(
        publishedIds.targets,
      );
      expect(catalog.modules.map((module) => module.id)).toEqual(
        publishedIds.modules,
      );
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

  it.effect("publishes only a current official catalog build", () =>
    Effect.gen(function* () {
      const expected = '{"formatVersion":1}\n';
      expect(yield* publishableCatalog(Option.some(expected), expected)).toBe(
        expected,
      );
      const missing = yield* Effect.flip(
        publishableCatalog(Option.none(), expected),
      );
      expect(missing._tag).toBe("OfficialCatalogBuildMissing");
      const stale = yield* Effect.flip(
        publishableCatalog(Option.some('{"formatVersion":0}\n'), expected),
      );
      expect(stale._tag).toBe("OfficialCatalogBuildStale");
    }),
  );
});
import { it } from "@effect/vitest";
