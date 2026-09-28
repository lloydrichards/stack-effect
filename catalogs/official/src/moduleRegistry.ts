import { cliModules } from "./modules/cli";
import { clientModules } from "./modules/client";
import { clientFoldkitModules } from "./modules/client-foldkit";
import { configModules } from "./modules/config";
import { domainModules } from "./modules/domain";
import { initModules } from "./modules/init";
import { mcpModules } from "./modules/mcp";
import { packageModules } from "./modules/packages";
import { serverModules } from "./modules/server";

/** Module groups in published declaration order. */
export const moduleGroups = [
  initModules,
  configModules,
  domainModules,
  serverModules,
  mcpModules,
  clientModules,
  clientFoldkitModules,
  packageModules,
  cliModules,
];
