import { exportOfficialCatalog } from "@repo/catalog-official/service";
import { STACK_CONFIG_SCHEMA_URL, StackConfig } from "@repo/domain/Scaffold";
import { Data, Effect, Option, Schema } from "effect";

export const CATALOG_ASSET_PATH = "/registry/v1/catalog.json";
export const CONFIG_SCHEMA_ASSET_PATH = "/schemas/v1/stack.effect.schema.json";

const JsonString = Schema.fromJsonString(Schema.Unknown, { space: 2 });

export const generateCatalogRegistryAssets = Effect.fn(
  "Docs.generateCatalogRegistryAssets",
)(function* () {
  const catalog = yield* exportOfficialCatalog;
  const configSchema = {
    ...Schema.toStandardJSONSchemaV1(StackConfig)["~standard"].jsonSchema.input(
      {
        target: "draft-2020-12",
      },
    ),
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: STACK_CONFIG_SCHEMA_URL,
  };
  const encodedSchema = yield* Schema.encodeEffect(JsonString)(configSchema);
  return {
    [CATALOG_ASSET_PATH]: catalog,
    [CONFIG_SCHEMA_ASSET_PATH]: `${encodedSchema}\n`,
  };
});

const rebuild = "run `bun run --cwd catalogs/official build` first";

export class OfficialCatalogBuildMissing extends Data.TaggedError(
  "OfficialCatalogBuildMissing",
) {
  override get message(): string {
    return `No built official catalog; ${rebuild}.`;
  }
}

export class OfficialCatalogBuildStale extends Data.TaggedError(
  "OfficialCatalogBuildStale",
) {
  override get message(): string {
    return `The built official catalog is out of date; ${rebuild}.`;
  }
}

/**
 * Publish the catalog workspace's build output only when it matches the
 * definitions checked in this run, so the site never serves a stale build.
 */
export const publishableCatalog = (
  built: Option.Option<string>,
  expected: string,
): Effect.Effect<
  string,
  OfficialCatalogBuildMissing | OfficialCatalogBuildStale
> =>
  Option.match(built, {
    onNone: () => Effect.fail(new OfficialCatalogBuildMissing()),
    onSome: (catalog) =>
      catalog === expected
        ? Effect.succeed(catalog)
        : Effect.fail(new OfficialCatalogBuildStale()),
  });
