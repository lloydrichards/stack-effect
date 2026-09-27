import { CatalogService } from "./CatalogService";
import { moduleRegistry } from "./registry/moduleRegistry";
import { targetRegistry } from "./registry/targetRegistry";

/** Local definitions for repository tooling and the temporary bundled clients. */
export const bundledCatalog = {
  targets: targetRegistry,
  modules: moduleRegistry,
};

export const BundledCatalogLayer = CatalogService.fromFragments(
  [bundledCatalog],
  { trustedFragmentIndex: 0 },
);
