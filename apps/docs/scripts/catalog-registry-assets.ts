import {
  exportAuthorCatalog,
  publishedAuthorCatalogUrl,
} from "@repo/catalog-author/service";
import {
  exportOfficialCatalog,
  publishedCatalogUrl,
} from "@repo/catalog-official/service";
import { STACK_CONFIG_SCHEMA_URL, StackConfig } from "@repo/domain/Scaffold";
import { Data, Effect, Option, Schema } from "effect";

export const CATALOG_ASSET_PATH = "/registry/v1/catalog.json";
export const AUTHOR_CATALOG_ASSET_PATH = "/registry/v1/author.json";
export const CONFIG_SCHEMA_ASSET_PATH = "/schemas/v1/stack.effect.schema.json";

const JsonString = Schema.fromJsonString(Schema.Unknown, { space: 2 });

export const generateCatalogRegistryAssets = Effect.fn(
  "Docs.generateCatalogRegistryAssets",
)(function* () {
  const catalog = yield* exportOfficialCatalog;
  const author = yield* exportAuthorCatalog;
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
    [AUTHOR_CATALOG_ASSET_PATH]: author,
    [CONFIG_SCHEMA_ASSET_PATH]: `${encodedSchema}\n`,
  };
});

/** A catalog the site hosts, with the workspace whose build it publishes. */
export interface PublishedCatalog {
  readonly asset: typeof CATALOG_ASSET_PATH | typeof AUTHOR_CATALOG_ASSET_PATH;
  readonly workspace: string;
  readonly build: URL;
}

export const publishedCatalogs: ReadonlyArray<PublishedCatalog> = [
  {
    asset: CATALOG_ASSET_PATH,
    workspace: "catalogs/official",
    build: publishedCatalogUrl,
  },
  {
    asset: AUTHOR_CATALOG_ASSET_PATH,
    workspace: "catalogs/author",
    build: publishedAuthorCatalogUrl,
  },
];

class CatalogBuildMissing extends Data.TaggedError("CatalogBuildMissing")<{
  readonly catalog: PublishedCatalog;
}> {
  override get message(): string {
    return `No built catalog for ${this.catalog.asset}; run \`bun run --cwd ${this.catalog.workspace} build\` first.`;
  }
}

class CatalogBuildStale extends Data.TaggedError("CatalogBuildStale")<{
  readonly catalog: PublishedCatalog;
}> {
  override get message(): string {
    return `The built catalog for ${this.catalog.asset} is out of date; run \`bun run --cwd ${this.catalog.workspace} build\` first.`;
  }
}

/**
 * Publish a catalog workspace's build output only when it matches the
 * definitions checked in this run, so the site never serves a stale build.
 */
export const publishableCatalog = (
  catalog: PublishedCatalog,
  built: Option.Option<string>,
  expected: string,
): Effect.Effect<string, CatalogBuildMissing | CatalogBuildStale> =>
  Option.match(built, {
    onNone: () => Effect.fail(new CatalogBuildMissing({ catalog })),
    onSome: (source) =>
      source === expected
        ? Effect.succeed(source)
        : Effect.fail(new CatalogBuildStale({ catalog })),
  });
