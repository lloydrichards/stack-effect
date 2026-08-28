import {
  GIT_HOOK_PROVIDERS,
  type GitHookProviderValue,
} from "@repo/scaffold/browser";

const providerModuleIds: ReadonlySet<string> = new Set(
  GIT_HOOK_PROVIDERS.flatMap(({ moduleId }) =>
    moduleId === undefined ? [] : [moduleId],
  ),
);

const providerForModules = (modules: ReadonlyArray<string>) => {
  const providers = modules.filter((moduleId) =>
    providerModuleIds.has(moduleId),
  );
  return providers.length === 1
    ? GIT_HOOK_PROVIDERS.find(({ moduleId }) => moduleId === providers[0])
    : undefined;
};

export const getGitHookProviderValue = (
  modules: ReadonlyArray<string>,
): GitHookProviderValue => providerForModules(modules)?.value ?? "none";

export const replaceGitHookProvider = (
  modules: ReadonlyArray<string>,
  value: GitHookProviderValue,
): ReadonlyArray<string> => {
  const unrelated = modules.filter(
    (moduleId) => !providerModuleIds.has(moduleId),
  );
  const moduleId = GIT_HOOK_PROVIDERS.find(
    (provider) => provider.value === value,
  )?.moduleId;
  return moduleId === undefined ? unrelated : [...unrelated, moduleId];
};

export const normalizeGitHookModules = (
  modules: ReadonlyArray<string>,
  context: { readonly gitEnabled: boolean; readonly runtime: "bun" | "node" },
): ReadonlyArray<string> => {
  const provider = providerForModules(modules);
  return !context.gitEnabled ||
    provider === undefined ||
    (provider.value === "husky" && context.runtime === "bun")
    ? replaceGitHookProvider(modules, "none")
    : modules;
};
