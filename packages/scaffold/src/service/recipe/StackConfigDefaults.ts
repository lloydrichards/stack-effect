import { type RuntimeName, StackConfig } from "@repo/domain/Scaffold";
import { Context, Schema } from "effect";

export const StackConfigDefaults = Context.Reference<StackConfig>(
  "@repo/scaffold/StackConfigDefaults",
  {
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
  },
);

type RuntimeDefaults = {
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
