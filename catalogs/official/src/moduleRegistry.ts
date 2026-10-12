import { alchemyModules } from "./modules/alchemy";
import { cliModules } from "./modules/cli";
import { clientModules } from "./modules/client";
import { clientFoldkitModules } from "./modules/client-foldkit";
import { cloudflareWorkerModules } from "./modules/cloudflare-worker";
import { configModules } from "./modules/config";
import { domainModules } from "./modules/domain";
import { initModules } from "./modules/init";
import { mcpModules } from "./modules/mcp";
import { packageModules } from "./modules/packages";
import { serverModules } from "./modules/server";
import { workerHttpClientModules } from "./modules/worker-http-client";

/** Module groups in published declaration order. */
export const moduleGroups = [
  initModules,
  configModules,
  domainModules,
  serverModules,
  cloudflareWorkerModules,
  mcpModules,
  clientModules,
  clientFoldkitModules,
  workerHttpClientModules,
  alchemyModules,
  packageModules,
  cliModules,
];
