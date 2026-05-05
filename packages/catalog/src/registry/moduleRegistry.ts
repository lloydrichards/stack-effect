import type { ModuleDefinition } from "@repo/domain/Catalog";
import { clientModules } from "./modules/client";
import { configModules } from "./modules/config";
import { domainModules } from "./modules/domain";
import { initModules } from "./modules/init";
import { packageModules } from "./modules/packages";
import { serverModules } from "./modules/server";

export const moduleRegistry: ReadonlyArray<typeof ModuleDefinition.Type> = [
  ...initModules,
  ...configModules,
  ...domainModules,
  ...serverModules,
  ...clientModules,
  ...packageModules,
];
