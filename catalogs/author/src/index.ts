import type { CatalogInput } from "@repo/authoring";
import { moduleGroup } from "./modules";
import { targetGroup } from "./targets";

/** The author catalog, which creates a standalone catalog registry project. */
export const authorCatalog: CatalogInput = {
  targets: [targetGroup],
  modules: [moduleGroup],
};

export const authorCatalogRoot = new URL("../", import.meta.url);

/** The catalog ID of the published `author.json` document. */
export const AUTHOR_CATALOG_ID = "stack-effect-author";
