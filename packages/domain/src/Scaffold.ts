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
  git: Schema.optional(Schema.Boolean),
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
  resolve(template: string): string {
    const resolvedTargetName =
      this.identity.name.trim().length > 0
        ? this.identity.name
        : this.identity.kind;

    return template
      .replaceAll("{{targetPath}}", this.identity.toPath())
      .replaceAll("{{targetDir}}", this.identity.toPath())
      .replaceAll("{{targetKind}}", this.identity.kind)
      .replaceAll("{{targetName}}", resolvedTargetName)
      .replaceAll("{{packageName}}", this.identity.toPackageName())
      .replaceAll("{{runtime}}", this.config.runtimeName)
      .replaceAll("{{packageManager}}", this.config.packageManagerName)
      .replaceAll("{{packageManagerSpec}}", this.config.packageManagerSpec)
      .replaceAll("{{projectName}}", this.config.name);
  }
}
