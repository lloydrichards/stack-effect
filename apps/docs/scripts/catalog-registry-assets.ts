import { exportOfficialCatalog } from "@repo/catalog-official/service";
import { STACK_CONFIG_SCHEMA_URL, StackConfig } from "@repo/domain/Scaffold";
import { Effect, Schema } from "effect";

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
