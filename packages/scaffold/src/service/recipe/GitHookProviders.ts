export const GIT_HOOK_PROVIDER_VALUES = ["none", "lefthook", "husky"] as const;

export type GitHookProviderValue = (typeof GIT_HOOK_PROVIDER_VALUES)[number];
export type GitHookProviderModuleId =
  | "workspace-git-hooks-lefthook"
  | "workspace-git-hooks-husky";

type GitHookProvider = {
  readonly value: GitHookProviderValue;
  readonly moduleId: GitHookProviderModuleId | undefined;
  readonly label: string;
};

export const GIT_HOOK_PROVIDERS: ReadonlyArray<GitHookProvider> = [
  { value: "none", moduleId: undefined, label: "None" },
  {
    value: "lefthook",
    moduleId: "workspace-git-hooks-lefthook",
    label: "Lefthook",
  },
  {
    value: "husky",
    moduleId: "workspace-git-hooks-husky",
    label: "Husky + lint-staged (Node >=24 only)",
  },
];

export const getGitHookProvider = (
  value: GitHookProviderValue,
): GitHookProvider =>
  GIT_HOOK_PROVIDERS.find((provider) => provider.value === value) ??
  GIT_HOOK_PROVIDERS[0]!;

export const hasSupportedGitHookTask = (config: {
  readonly format?: string;
  readonly lint?: string;
}): boolean =>
  config.format === "biome" ||
  config.format === "oxfmt" ||
  config.lint === "biome" ||
  config.lint === "oxlint";

export const isGitHookProviderEligible = (
  value: GitHookProviderValue,
  config: {
    readonly runtime: "bun" | "node";
    readonly packageManager: "bun" | "npm" | "pnpm";
    readonly git: boolean;
    readonly format?: string;
    readonly lint?: string;
  },
): boolean =>
  value === "none" ||
  (config.git &&
    hasSupportedGitHookTask(config) &&
    (value === "lefthook" ||
      (config.runtime === "node" && config.packageManager !== "bun")));
