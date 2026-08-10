const workspaceToolModules = {
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
} as const;

const moduleToolValues = Object.fromEntries(
  [
    ...Object.entries(workspaceToolModules),
    ...Object.entries(workspaceLintModules),
    ...Object.entries(workspaceFormatModules),
  ].map(([tool, moduleId]) => [moduleId, tool]),
);

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

export const toWorkspaceToolValue = (moduleId: string): string =>
  moduleToolValues[moduleId] ?? moduleId;

export const toTypeScriptModuleId = (version: "6" | "7"): string =>
  `workspace-typescript-${version}`;
