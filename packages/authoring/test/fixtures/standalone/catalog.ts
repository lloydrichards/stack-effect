import type { CatalogInput } from "@repo/authoring";
import { acmeModules } from "./modules";
import { acmeTargets } from "./targets";

export const root = new URL("./", import.meta.url);

export const catalog: CatalogInput = {
  targets: [acmeTargets],
  modules: [acmeModules],
};
