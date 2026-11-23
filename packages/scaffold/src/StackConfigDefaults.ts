/**
 * The default stack configuration that recipes and the CLI fall back to, and
 * the per-runtime adjustments to those defaults.
 */
import { type RuntimeName, StackConfig } from "@repo/domain/Scaffold";
import { Context, Schema } from "effect";

/**
 * The configuration a recipe uses for every field the user leaves unset.
 *
 * **When to use**
 *
 * Read it to prefill configuration prompts and forms. Provide a different
 * value to change the defaults, such as for a custom-only catalog selection.
 */
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

/**
 * Adjusts tool defaults for a runtime. Deno, for example, defaults to
 * TypeScript 6 with no monorepo, lint, or format tool.
 *
 * **When to use**
 *
 * Recompute the suggested tools when the user changes the runtime.
 *
 * **Gotchas**
 *
 * A runtime override of `undefined` clears that default rather than keeping
 * it. TypeScript falls back to `"6"` when no default names a version.
 */
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
