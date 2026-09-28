import {
  type CatalogInput,
  defineModules,
  defineTargets,
} from "@repo/authoring";
import { moduleRegistry } from "./moduleRegistry";
import { targetRegistry } from "./targetRegistry";

/** The official Stack Effect catalog, authored like any external catalog. */
export const officialCatalog: CatalogInput = {
  targets: [defineTargets(import.meta.url, targetRegistry)],
  modules: [defineModules(import.meta.url, moduleRegistry)],
};

/** Directory that official source and template paths are reported against. */
export const officialCatalogRoot = new URL("../", import.meta.url);
