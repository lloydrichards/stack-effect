import { NodeServices } from "@effect/platform-node";
import { buildCatalog } from "@repo/authoring";
import { CatalogService } from "@repo/catalog";
import { OFFICIAL_CATALOG_ID } from "@repo/domain/CatalogSource";
import { Effect, Layer } from "effect";
import { officialCatalog, officialCatalogRoot } from "./index";

/**
 * Build the official catalog for repository tooling and tests. Only this
 * application-owned wiring allows Finalize scripts; loaders decide trust.
 */
export const buildOfficialCatalog = buildCatalog(officialCatalog, {
  catalogId: OFFICIAL_CATALOG_ID,
  root: officialCatalogRoot,
  finalizeScripts: "allow",
}).pipe(Effect.provide(NodeServices.layer));

/** The official v1 catalog document as published JSON. */
export const exportOfficialCatalog = buildOfficialCatalog.pipe(
  Effect.map(({ json }) => json),
);

/**
 * A CatalogService over the local official definitions plus extra fragments,
 * with only the official document trusted for Finalize.
 */
export const officialCatalogLayerWith = (fragments: ReadonlyArray<unknown>) =>
  Layer.unwrap(
    buildOfficialCatalog.pipe(
      Effect.map(({ document }) =>
        CatalogService.fromFragments([document, ...fragments], {
          trustedFragmentIndex: 0,
        }),
      ),
    ),
  );

export const OfficialCatalogLayer = officialCatalogLayerWith([]);

/** Where `bun run build` writes the published document for static hosting. */
export const publishedCatalogUrl = new URL(
  "../dist/registry/v1/catalog.json",
  import.meta.url,
);
