const workspaceToolModules = {
  turbo: "workspace-monorepo-turbo",
  biome: "workspace-quality-biome",
  dprint: "workspace-quality-dprint",
  oxlint: "workspace-quality-oxlint",
  vitest: "workspace-test-vitest",
} as const;

const moduleToolValues = Object.fromEntries(
  Object.entries(workspaceToolModules).map(([tool, moduleId]) => [
    moduleId,
    tool,
  ]),
);

export const toWorkspaceModuleId = (toolValue: string): string =>
  workspaceToolModules[toolValue as keyof typeof workspaceToolModules] ??
  toolValue;

export const toWorkspaceToolValue = (moduleId: string): string =>
  moduleToolValues[moduleId] ?? moduleId;
