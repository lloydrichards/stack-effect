import { Hash, Schema, SchemaGetter, String as Str } from "effect";
import {
  Contribution,
  GenerationDomainAdapterId,
  GenerationDomainId,
  GenerationDomainOptionId,
  ModuleId,
  TargetIdentity,
  TargetKey,
} from "./Catalog";

export const GenerationDomainContributionProvenance = Schema.Struct({
  domainId: GenerationDomainId,
  optionId: GenerationDomainOptionId,
  adapterId: Schema.optional(GenerationDomainAdapterId),
});

export const TargetContribution = Schema.Struct({
  targetKey: TargetKey,
  contributions: Schema.Array(Contribution),
  generationDomain: Schema.optional(GenerationDomainContributionProvenance),
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

const Infrastructure = Schema.optional(
  Schema.Literals(["none", "cloudflare"]),
).pipe(
  Schema.decodeTo(Schema.optional(Schema.Literal("cloudflare")), {
    decode: SchemaGetter.transform((value) =>
      value === "none" ? undefined : value,
    ),
    encode: SchemaGetter.transform((value) => value),
  }),
);

export class StackConfig extends Schema.Class<StackConfig>("StackConfig")({
  name: Schema.NonEmptyString,
  runtime: Runtime,
  typescript: Schema.optional(TypeScriptVersion),
  lint: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  monorepo: Schema.optional(Schema.String),
  infrastructure: Infrastructure,
}) {
  get effectiveInfrastructure(): "none" | "cloudflare" {
    return this.infrastructure ?? "none";
  }

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

const toHexByte = (byte: number): string => byte.toString(16).padStart(2, "0");

const encodeUtf8CodePoint = (codePoint: number): string => {
  if (codePoint <= 0x7f) return toHexByte(codePoint);
  if (codePoint <= 0x7ff) {
    return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)]
      .map(toHexByte)
      .join("");
  }
  if (codePoint <= 0xffff) {
    return [
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    ]
      .map(toHexByte)
      .join("");
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ]
    .map(toHexByte)
    .join("");
};

const encodeUtf8Hex = (value: string): string =>
  Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === undefined ? "" : encodeUtf8CodePoint(codePoint);
  }).join("");

const ProviderSafeEncodedPrefix = "se-encoded-";
const ProviderSafeIdentityPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const toProviderSafeSlug = (value: string): string =>
  Str.kebabCase(value.trim())
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");

const providerSafeIdentityComponent = (
  rawName: string,
  fallback: string,
): string => {
  if (
    ProviderSafeIdentityPattern.test(rawName) &&
    !rawName.startsWith(ProviderSafeEncodedPrefix)
  ) {
    return rawName;
  }

  const fallbackSlug = toProviderSafeSlug(fallback) || "identity";
  const readableSlug = toProviderSafeSlug(rawName) || fallbackSlug;
  return `${ProviderSafeEncodedPrefix}${readableSlug}-x${encodeUtf8Hex(rawName)}`;
};

export class ContributionTokenContext extends Schema.Class<ContributionTokenContext>(
  "ContributionTokenContext",
)({
  targetKey: TargetKey,
  identity: TargetIdentity,
  config: StackConfig,
  generationDomainAdapterId: Schema.optional(GenerationDomainAdapterId),
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
   * - `{{format}}` - Format tool ("biome", "dprint", "oxfmt", or "")
   * - `{{test}}` - Test framework ("vitest" or "")
   * - `{{monorepo}}` - Monorepo tool (for example, "turbo", "vite-plus", or "nx")
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
    const providerSafeProjectName = providerSafeIdentityComponent(
      this.config.name,
      "project",
    );
    const providerSafeTargetName = providerSafeIdentityComponent(
      this.identity.name,
      this.identity.kind,
    );

    // NOTE: Workspace targets omit "./" so token output matches contribution paths.
    const resolveTargetToken = (t: string, token: string) =>
      targetPath === "."
        ? t.replaceAll(`${token}/`, "").replaceAll(token, "")
        : t.replaceAll(token, targetPath);

    const stableIdentityHash = (
      Hash.string(
        [
          this.config.name,
          this.generationDomainAdapterId ?? "",
          this.targetKey,
          targetPath,
        ].join("\0"),
      ) >>> 0
    )
      .toString(16)
      .padStart(8, "0");

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
        case "infrastructure":
          return this.config.effectiveInfrastructure;
        default:
          return "";
      }
    };

    const resolveConditionals = (t: string): string => {
      const conditionalRegex =
        /\{\{#if\s+(\w+)(?:=([\w-]+))?\}\}([\s\S]*?)\{\{\/if\}\}/g;
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
          .replaceAll("{{providerSafeProjectName}}", providerSafeProjectName)
          .replaceAll("{{providerSafeTargetName}}", providerSafeTargetName)
          .replaceAll("{{targetKey}}", this.targetKey)
          .replaceAll(
            "{{generationDomainAdapterId}}",
            this.generationDomainAdapterId ?? "",
          )
          .replaceAll("{{stableIdentityHash}}", stableIdentityHash)
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
