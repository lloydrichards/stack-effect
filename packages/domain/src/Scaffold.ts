import { Schema } from "effect";
import { Contribution, ModuleId, TargetKey } from "./Catalog";

export const TargetContribution = Schema.Struct({
  targetKey: TargetKey,
  contributions: Schema.Array(Contribution),
});

export const ModuleContribution = Schema.Struct({
  targetKey: TargetKey,
  moduleId: ModuleId,
  contributions: Schema.Array(Contribution),
});

export const ContributionTokenContext = Schema.Struct({
  targetKey: TargetKey,
  targetPath: Schema.String,
  targetKind: Schema.String,
  targetName: Schema.NonEmptyString,
  runtime: Schema.NonEmptyString,
  packageManager: Schema.NonEmptyString,
  packageManagerSpec: Schema.NonEmptyString,
  projectName: Schema.NonEmptyString,
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
  lint: Schema.optional(Schema.Literals(["biome"])),
  format: Schema.optional(Schema.Literals(["biome"])),
  test: Schema.optional(Schema.Literals(["vitest"])),
  monorepo: Schema.optional(Schema.Literals(["turbo"])),
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
