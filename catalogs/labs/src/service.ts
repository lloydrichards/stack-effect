import { NodeServices } from "@effect/platform-node";
import { buildCatalog } from "@repo/authoring";
import { buildOfficialCatalog } from "@repo/catalog-official/service";
import { Effect } from "effect";
import { LABS_CATALOG_ID, labsCatalog, labsCatalogRoot } from "./index";

export const buildLabsCatalog = Effect.gen(function* () {
  const { document: official } = yield* buildOfficialCatalog;
  return yield* buildCatalog(labsCatalog, {
    catalogId: LABS_CATALOG_ID,
    root: labsCatalogRoot,
    requires: ["official"],
    official,
  });
}).pipe(Effect.provide(NodeServices.layer));

/** The Labs v1 catalog document as published JSON. */
export const exportLabsCatalog = buildLabsCatalog.pipe(
  Effect.map(({ json }) => json),
);

/** Where `bun run build` writes the document for static hosting. */
export const publishedLabsCatalogUrl = new URL(
  "../dist/registry/v1/labs.json",
  import.meta.url,
);
