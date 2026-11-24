/**
 * The decoded `stack.effect.json`: the runtime, tooling, and catalog sources a
 * project was scaffolded with.
 */
import { Context, Match, Schema } from "effect";
import {
  CatalogSources,
  defaultCatalogSources,
  OFFICIAL_CATALOG_SOURCE,
} from "./Catalog";

export const Runtime = Schema.TaggedUnion({
  bun: {},
  deno: {},
  node: {
    packageManager: Schema.Literals(["pnpm", "npm"]),
  },
});

export type Runtime = typeof Runtime.Type;

export type RuntimeName = Runtime["_tag"];
export type PackageManagerName = "bun" | "deno" | "pnpm" | "npm";

const packageManagerRuntimes: Record<PackageManagerName, RuntimeName> = {
  bun: "bun",
  deno: "deno",
  pnpm: "node",
  npm: "node",
};

export const runtimeForPackageManager = (
  packageManager: PackageManagerName,
): RuntimeName => packageManagerRuntimes[packageManager];

export const makeRuntime = (
  runtime: RuntimeName,
  packageManager: PackageManagerName,
): Runtime =>
  Match.value(runtime).pipe(
    Match.when("bun", () => ({ _tag: "bun" as const })),
    Match.when("deno", () => ({ _tag: "deno" as const })),
    Match.when("node", () => ({
      _tag: "node" as const,
      packageManager:
        packageManager === "npm" ? ("npm" as const) : ("pnpm" as const),
    })),
    Match.exhaustive,
  );

const TypeScriptVersion = Schema.Literals(["6", "7"]);

export type TypeScriptVersion = typeof TypeScriptVersion.Type;

export const STACK_CONFIG_SCHEMA_URL =
  "https://stack-effect.lloydrichards.dev/schemas/v1/stack.effect.schema.json";

export class StackConfig extends Schema.Class<StackConfig>("StackConfig")({
  $schema: Schema.optional(Schema.String),
  name: Schema.NonEmptyString,
  runtime: Runtime,
  typescript: Schema.optional(TypeScriptVersion),
  lint: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  monorepo: Schema.optional(Schema.String),
  /** Explicit catalog selection. Absent means the official source only. */
  catalogs: Schema.optional(CatalogSources),
}) {
  /** The same config with a catalog selection, e.g. a project's saved sources. */
  // fallow-ignore-next-line unused-class-member -- called by the CLI plan command
  withCatalogs(catalogs: CatalogSources): StackConfig {
    return new StackConfig({
      $schema: this.$schema,
      name: this.name,
      runtime: this.runtime,
      typescript: this.typescript,
      lint: this.lint,
      format: this.format,
      test: this.test,
      monorepo: this.monorepo,
      catalogs,
    });
  }

  get catalogSources(): CatalogSources {
    return this.catalogs ?? defaultCatalogSources;
  }

  /** Official tool defaults and workspace modules apply only with the official source. */
  get usesOfficialCatalog(): boolean {
    return this.catalogSources.some(
      (source) => source.name === OFFICIAL_CATALOG_SOURCE,
    );
  }

  get typescriptVersion(): TypeScriptVersion {
    return this.typescript ?? "6";
  }

  get runtimeName(): "bun" | "deno" | "node" {
    return this.runtime._tag;
  }

  get packageManagerName(): "bun" | "deno" | "npm" | "pnpm" {
    return Runtime.match(this.runtime, {
      bun: () => "bun" as const,
      deno: () => "deno" as const,
      node: (r) => r.packageManager,
    });
  }

  // fallow-ignore-next-line unused-class-member -- called by ContributionTokenContext.resolve
  get packageManagerSpec(): string {
    switch (this.packageManagerName) {
      case "bun":
        return "bun@1.4.2";
      case "deno":
        return "deno@2.9.4";
      case "npm":
        return "npm@10.9.0";
      case "pnpm":
        return "pnpm@11.7.0";
    }
  }

  // fallow-ignore-next-line unused-class-member -- called by ContributionTokenContext.resolve
  get workspaceDependency(): "*" | "workspace:*" {
    return this.packageManagerName === "npm" ? "*" : "workspace:*";
  }
}

/**
 * The configuration a recipe uses for every field the user leaves unset.
 *
 * **When to use**
 *
 * Read it to prefill configuration prompts and forms. Provide a different
 * value to change the defaults, such as for a custom-only catalog selection.
 */
export const StackConfigDefaults: Context.Reference<StackConfig> =
  Context.Reference<StackConfig>("@repo/domain/StackConfigDefaults", {
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

const workspaceToolModules: Readonly<Record<string, string>> = {
  nx: "workspace-monorepo-nx",
  turbo: "workspace-monorepo-turbo",
  "vite-plus": "workspace-monorepo-vite-plus",
  dprint: "workspace-quality-dprint",
  oxlint: "workspace-quality-oxlint",
  vitest: "workspace-test-vitest",
};

const workspaceLintModules: Readonly<Record<string, string>> = {
  biome: "workspace-quality-biome-lint",
};

const workspaceFormatModules: Readonly<Record<string, string>> = {
  biome: "workspace-quality-biome-format",
  oxfmt: "workspace-quality-oxfmt",
};

const workspaceCategoryModules: Record<
  "lint" | "format" | "tool",
  Readonly<Record<string, string>>
> = {
  lint: workspaceLintModules,
  format: workspaceFormatModules,
  tool: {},
};

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
  workspaceCategoryModules[category][toolValue] ??
  workspaceToolModules[toolValue] ??
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
