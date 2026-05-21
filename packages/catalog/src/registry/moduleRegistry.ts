import type { ModuleDefinition } from "@repo/domain/Catalog";
import { cliModules } from "./modules/cli";
import { clientModules } from "./modules/client";
import { clientFoldkitModules } from "./modules/client-foldkit";
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
  ...clientFoldkitModules,
  ...packageModules,
  ...cliModules,
];
