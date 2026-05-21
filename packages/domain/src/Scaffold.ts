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

export class StackConfig extends Schema.Class<StackConfig>("StackConfig")({
  name: Schema.NonEmptyString,
  runtime: Runtime,
  lint: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  monorepo: Schema.optional(Schema.String),
}) {
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
        return "pnpm@10.17.0";
    }
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

    // When targetPath is "." (init target), avoid producing "./foo" paths —
    // strip the leading "./" so paths stay consistent with module contributions.
    const resolveTargetToken = (t: string, token: string) =>
      targetPath === "."
        ? t.replaceAll(`${token}/`, "").replaceAll(token, "")
        : t.replaceAll(token, targetPath);

    // Config field lookup for conditionals and tokens
    const getConfigValue = (field: string): string => {
      switch (field) {
        case "runtime":
          return this.config.runtimeName;
        case "packageManager":
          return this.config.packageManagerName;
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

    // Process conditionals: {{#if field}}...{{/if}} or {{#if field=value}}...{{/if}}
    const resolveConditionals = (t: string): string => {
      const conditionalRegex =
        /\{\{#if\s+(\w+)(?:=(\w+))?\}\}([\s\S]*?)\{\{\/if\}\}/g;
      return t.replace(conditionalRegex, (_, field, value, content) => {
        const configValue = getConfigValue(field);
        if (value !== undefined) {
          // Equality check: {{#if field=value}}
          return configValue === value ? content : "";
        }
        // Truthy check: {{#if field}}
        return configValue.length > 0 ? content : "";
      });
    };

    // First resolve conditionals, then simple tokens
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
