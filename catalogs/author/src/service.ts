import { NodeServices } from "@effect/platform-node";
import { buildCatalog } from "@repo/authoring";
import { buildOfficialCatalog } from "@repo/catalog-official/service";
import { Effect } from "effect";
import { AUTHOR_CATALOG_ID, authorCatalog, authorCatalogRoot } from "./index";

/**
 * Build the author catalog. Its registry project lives in the official
 * workspace, so it requires the official catalog and validates against the
 * local official definitions, which the output never embeds.
 */
export const buildAuthorCatalog = Effect.gen(function* () {
  const { document: official } = yield* buildOfficialCatalog;
  return yield* buildCatalog(authorCatalog, {
    catalogId: AUTHOR_CATALOG_ID,
    root: authorCatalogRoot,
    requires: ["official"],
    official,
  });
}).pipe(Effect.provide(NodeServices.layer));

/** The author v1 catalog document as published JSON. */
export const exportAuthorCatalog = buildAuthorCatalog.pipe(
  Effect.map(({ json }) => json),
);

/** Where `bun run build` writes the document for static hosting. */
export const publishedAuthorCatalogUrl = new URL(
  "../dist/registry/v1/author.json",
  import.meta.url,
);
