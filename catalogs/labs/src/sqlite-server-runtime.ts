import { defineModules } from "@repo/authoring";

const api = { kind: "server", name: "api" };
export const sqliteServerRuntime = {
  _tag: "required-module",
  target: api,
  moduleId: "server-sqlite-runtime",
} as const;

export const sqliteServerRuntimeModules = defineModules(import.meta.url, [
  {
    id: sqliteServerRuntime.moduleId,
    title: "SQLite Server Runtime",
    description: "Enable SQLite native bindings in Deno server scripts",
    visibility: "internal",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: api }],
    dependencies: [],
    contributions: [],
  },
]);
