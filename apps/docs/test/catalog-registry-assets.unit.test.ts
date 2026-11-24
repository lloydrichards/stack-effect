import { assert, describe, it } from "@effect/vitest";
import { CatalogDocument } from "@repo/domain/Catalog";
import { STACK_CONFIG_SCHEMA_URL } from "@repo/domain/Scaffold";
import Ajv2020 from "ajv/dist/2020.js";
import { Effect, Option, Schema } from "effect";
import { isMovedToLabs } from "../app/components/recipe-builder/labs-migration";
import {
  AUTHOR_CATALOG_ASSET_PATH,
  CATALOG_ASSET_PATH,
  CONFIG_SCHEMA_ASSET_PATH,
  generateCatalogRegistryAssets,
  LABS_CATALOG_ASSET_PATH,
  publishableCatalog,
  type PublishedCatalog,
} from "../scripts/catalog-registry-assets";
import publishedAuthorIds from "./fixtures/published-author-catalog-ids.json";
import publishedIds from "./fixtures/published-catalog-ids.json";

describe("catalog registry assets", () => {
  it.effect.each([
    {
      asset: CATALOG_ASSET_PATH,
      ids: {
        targets: publishedIds.targets,
        modules: publishedIds.modules.filter((id) => !isMovedToLabs(id)),
      },
    },
    { asset: AUTHOR_CATALOG_ASSET_PATH, ids: publishedAuthorIds },
  ] as const)(
    "should still publish every previously published identifier when $asset is generated",
    ({ asset, ids }) =>
      Effect.gen(function* () {
        const assets = yield* generateCatalogRegistryAssets();
        const catalog = yield* Schema.decodeEffect(
          Schema.fromJsonString(CatalogDocument),
        )(assets[asset]);

        // Previously published IDs remain available except for the explicit Labs moves.
        assert.includeMembers(
          catalog.targets.map((target) => target.kind),
          ids.targets,
        );
        assert.includeMembers(
          catalog.modules.map((module) => module.id),
          ids.modules,
        );
      }),
  );

  it.effect(
    "moves the published experiments to Labs without duplicating their IDs",
    () =>
      Effect.gen(function* () {
        const assets = yield* generateCatalogRegistryAssets();
        const decode = Schema.decodeEffect(
          Schema.fromJsonString(CatalogDocument),
        );
        const official = yield* decode(assets[CATALOG_ASSET_PATH]);
        const labs = yield* decode(assets[LABS_CATALOG_ASSET_PATH]);
        const officialIds = official.modules.map(({ id }) => id);
        assert.deepStrictEqual(officialIds.filter(isMovedToLabs), []);
        assert.deepStrictEqual(labs.requires, ["official"]);
        assert.includeMembers(
          labs.modules.map(({ id }) => id),
          [
            "client-react-web-worker",
            "package-ai-toolkit-webfetch",
            "server-chat-runtime-managed",
            "cli-persisted-queue",
          ],
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

        assert.containSubset(schema, {
          $id: STACK_CONFIG_SCHEMA_URL,
          $schema: "https://json-schema.org/draft/2020-12/schema",
        });
        assert.strictEqual(validate(old), true);
        assert.strictEqual(
          validate({ $schema: STACK_CONFIG_SCHEMA_URL, ...old }),
          true,
        );
        assert.strictEqual(
          validate({ ...old, runtime: { _tag: "unknown" } }),
          false,
        );
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
        assert.strictEqual(
          yield* publishableCatalog(example, Option.some(expected), expected),
          expected,
        );
      }),
  );

  it.effect(
    "should name the workspace to build when its build is missing",
    () =>
      Effect.gen(function* () {
        const missing = yield* Effect.flip(
          publishableCatalog(example, Option.none(), expected),
        );
        assert.strictEqual(missing._tag, "CatalogBuildMissing");
        assert.include(missing.message, example.workspace);
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
      assert.strictEqual(stale._tag, "CatalogBuildStale");
    }),
  );
});
