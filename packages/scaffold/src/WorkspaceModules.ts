/**
 * The mapping between configuration tool names, such as `turbo` or `oxlint`,
 * and the official workspace modules that provide them.
 */
const workspaceToolModules = {
  nx: "workspace-monorepo-nx",
  turbo: "workspace-monorepo-turbo",
  "vite-plus": "workspace-monorepo-vite-plus",
  dprint: "workspace-quality-dprint",
  oxlint: "workspace-quality-oxlint",
  vitest: "workspace-test-vitest",
} as const;

const workspaceLintModules = {
  biome: "workspace-quality-biome-lint",
} as const;

const workspaceFormatModules = {
  biome: "workspace-quality-biome-format",
  oxfmt: "workspace-quality-oxfmt",
} as const;

const moduleToolValues = Object.fromEntries(
  [
    ...Object.entries(workspaceToolModules),
    ...Object.entries(workspaceLintModules),
    ...Object.entries(workspaceFormatModules),
  ].map(([tool, moduleId]) => [moduleId, tool]),
);

/**
 * Maps a configured tool to its workspace module ID.
 *
 * **When to use**
 *
 * Turn a `lint`, `format`, or tool setting into the module a recipe adds.
 *
 * **Gotchas**
 *
 * `biome` maps to different modules for lint and format. An unknown value is
 * returned unchanged, so custom catalogs can name their own module IDs.
 */
export const toWorkspaceModuleId = (
  category: "lint" | "format" | "tool",
  toolValue: string,
): string =>
  (category === "lint"
    ? workspaceLintModules[toolValue as keyof typeof workspaceLintModules]
    : category === "format"
      ? workspaceFormatModules[toolValue as keyof typeof workspaceFormatModules]
      : undefined) ??
  workspaceToolModules[toolValue as keyof typeof workspaceToolModules] ??
  toolValue;

/**
 * Maps a workspace module ID back to its configuration tool name.
 *
 * **When to use**
 *
 * Show catalog modules as configuration choices. Unknown IDs are returned
 * unchanged.
 */
export const toWorkspaceToolValue = (moduleId: string): string =>
  moduleToolValues[moduleId] ?? moduleId;

/**
 * The workspace module ID for a TypeScript version.
 *
 * **When to use**
 *
 * Add the TypeScript module that matches the configured version.
 */
export const toTypeScriptModuleId = (version: "6" | "7"): string =>
  `workspace-typescript-${version}`;
