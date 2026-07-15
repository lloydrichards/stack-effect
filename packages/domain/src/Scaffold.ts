import { Schema } from "effect";
import { Contribution, ModuleId, TargetIdentity, TargetKey } from "./Catalog";

export const TargetContribution = Schema.Struct({
  targetKey: TargetKey,
  contributions: Schema.Array(Contribution),
});

export const ModuleContribution = Schema.Struct({
  targetKey: TargetKey,
  moduleId: ModuleId,
  contributions: Schema.Array(Contribution),
});

export const NormalizedContributions = Schema.Struct({
  targets: Schema.Array(TargetContribution),
  modules: Schema.Array(ModuleContribution),
});

const Runtime = Schema.TaggedUnion({
  bun: {},
  node: {
    packageManager: Schema.Literals(["pnpm", "npm"]),
  },
});

export const TypeScriptVersion = Schema.Literals(["6", "7"]);

export class StackConfig extends Schema.Class<StackConfig>("StackConfig")({
  name: Schema.NonEmptyString,
  runtime: Runtime,
  typescript: Schema.optional(TypeScriptVersion),
  lint: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  monorepo: Schema.optional(Schema.String),
}) {
  get typescriptVersion(): typeof TypeScriptVersion.Type {
    return this.typescript ?? "6";
  }

  get runtimeName(): "bun" | "node" {
    return this.runtime._tag;
  }

  get packageManagerName(): "bun" | "npm" | "pnpm" {
    return Runtime.match(this.runtime, {
      bun: () => "bun" as const,
      node: (r) => r.packageManager,
    });
  }

  get packageManagerSpec(): string {
    switch (this.packageManagerName) {
      case "bun":
        return "bun@1.2.21";
      case "npm":
        return "npm@10.9.0";
      case "pnpm":
        return "pnpm@11.7.0";
    }
  }

  get workspaceDependency(): "*" | "workspace:*" {
    return this.packageManagerName === "npm" ? "*" : "workspace:*";
  }
}

export class ContributionTokenContext extends Schema.Class<ContributionTokenContext>(
  "ContributionTokenContext",
)({
  targetKey: TargetKey,
  identity: TargetIdentity,
  config: StackConfig,
}) {
  /**
   * Resolve template tokens and conditionals in a string.
   *
   * ## Simple Tokens
   * - `{{projectName}}` - Project name from config
   * - `{{runtime}}` - "bun" or "node"
   * - `{{packageManager}}` - "bun", "npm", or "pnpm"
   * - `{{packageManagerSpec}}` - Full version spec (e.g., "bun@1.2.21")
   * - `{{typescript}}` - TypeScript major version ("6" or "7"; defaults to "6")
   * - `{{workspaceDependency}}` - Package-manager-compatible local workspace range
   * - `{{lint}}` - Lint tool ("biome", "oxlint", or "")
   * - `{{format}}` - Format tool ("biome", "dprint", or "")
   * - `{{test}}` - Test framework ("vitest" or "")
   * - `{{monorepo}}` - Monorepo tool ("turbo" or "")
   * - `{{targetKind}}`, `{{targetName}}`, `{{targetPath}}`, `{{targetDir}}`, `{{packageName}}`
   *
   * ## Conditionals
   * - `{{#if field}}...{{/if}}` - Include content if field is truthy (non-empty)
   * - `{{#if field=value}}...{{/if}}` - Include content if field equals value
   *
   * Unknown fields in conditionals silently evaluate as falsy.
   */
  resolve(template: string): string {
    const resolvedTargetName =
      this.identity.name.trim().length > 0
        ? this.identity.name
        : this.identity.kind;

    const targetPath = this.identity.toPath();

    // NOTE: Workspace targets omit "./" so token output matches contribution paths.
    const resolveTargetToken = (t: string, token: string) =>
      targetPath === "."
        ? t.replaceAll(`${token}/`, "").replaceAll(token, "")
        : t.replaceAll(token, targetPath);

    const getConfigValue = (field: string): string => {
      switch (field) {
        case "runtime":
          return this.config.runtimeName;
        case "packageManager":
          return this.config.packageManagerName;
        case "typescript":
          return this.config.typescriptVersion;
        case "lint":
          return this.config.lint ?? "";
        case "format":
          return this.config.format ?? "";
        case "test":
          return this.config.test ?? "";
        case "monorepo":
          return this.config.monorepo ?? "";
        default:
          return "";
      }
    };

    const resolveConditionals = (t: string): string => {
      const conditionalRegex =
        /\{\{#if\s+(\w+)(?:=(\w+))?\}\}([\s\S]*?)\{\{\/if\}\}/g;
      return t.replace(conditionalRegex, (_, field, value, content) => {
        const configValue = getConfigValue(field);
        if (value !== undefined) {
          return configValue === value ? content : "";
        }
        return configValue.length > 0 ? content : "";
      });
    };

    const withConditionals = resolveConditionals(template);

    return resolveTargetToken(
      resolveTargetToken(
        withConditionals
          .replaceAll("{{targetKind}}", this.identity.kind)
          .replaceAll("{{targetName}}", resolvedTargetName)
          .replaceAll("{{packageName}}", this.identity.toPackageName())
          .replaceAll("{{runtime}}", this.config.runtimeName)
          .replaceAll("{{packageManager}}", this.config.packageManagerName)
          .replaceAll("{{packageManagerSpec}}", this.config.packageManagerSpec)
          .replaceAll("{{typescript}}", this.config.typescriptVersion)
          .replaceAll(
            "{{workspaceDependency}}",
            this.config.workspaceDependency,
          )
          .replaceAll("{{projectName}}", this.config.name)
          .replaceAll("{{lint}}", this.config.lint ?? "")
          .replaceAll("{{format}}", this.config.format ?? "")
          .replaceAll("{{test}}", this.config.test ?? "")
          .replaceAll("{{monorepo}}", this.config.monorepo ?? ""),
        "{{targetDir}}",
      ),
      "{{targetPath}}",
    );
  }
}
