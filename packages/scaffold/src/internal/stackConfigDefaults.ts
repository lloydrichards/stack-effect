import { type RuntimeName, StackConfig } from "@repo/domain/StackConfig";
import { Context, Schema } from "effect";

/** @internal */
export const StackConfigDefaults: Context.Reference<StackConfig> =
  Context.Reference<StackConfig>("@repo/scaffold/StackConfigDefaults", {
    defaultValue: () =>
      new StackConfig({
        name: Schema.NonEmptyString.make("my-effect-app"),
        runtime: { _tag: "bun" },
        typescript: "7",
        monorepo: "vite-plus",
        lint: "oxlint",
        format: "oxfmt",
        test: "vitest",
      }),
  });

/** @internal */
export type RuntimeDefaults = {
  readonly typescript?: "6" | "7" | undefined;
  readonly monorepo?: string | undefined;
  readonly lint?: string | undefined;
  readonly format?: string | undefined;
  readonly test?: string | undefined;
};

const runtimeOverrides: Record<RuntimeName, Partial<RuntimeDefaults>> = {
  bun: {},
  deno: {
    typescript: "6",
    monorepo: undefined,
    lint: undefined,
    format: undefined,
  },
  node: {},
};

/** @internal */
export const defaultsForRuntime = (
  defaults: RuntimeDefaults,
  runtime: RuntimeName,
): RuntimeDefaults & { readonly typescript: "6" | "7" } => ({
  monorepo: defaults.monorepo,
  lint: defaults.lint,
  format: defaults.format,
  test: defaults.test,
  ...runtimeOverrides[runtime],
  typescript:
    runtimeOverrides[runtime].typescript ?? defaults.typescript ?? "6",
});

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

/** @internal */
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

/** @internal */
export const toWorkspaceToolValue = (moduleId: string): string =>
  moduleToolValues[moduleId] ?? moduleId;

/** @internal */
export const toTypeScriptModuleId = (version: "6" | "7"): string =>
  `workspace-typescript-${version}`;
