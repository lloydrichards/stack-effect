import { Schema } from "effect";
import { DesiredContributions, ModuleId, TargetKey } from "./Catalog";

export const emptyDesiredContributions =
  (): typeof DesiredContributions.Type => ({
    files: [],
    exports: [],
    dependencies: [],
    scripts: [],
    barrelExports: [],
    tsconfigs: [],
  });

export const TargetContribution = Schema.Struct({
  targetKey: TargetKey,
  contributions: DesiredContributions,
});

export const ModuleContribution = Schema.Struct({
  targetKey: TargetKey,
  moduleId: ModuleId,
  contributions: DesiredContributions,
});

export const ContributionTokenContext = Schema.Struct({
  targetKey: TargetKey,
  targetPath: Schema.String,
  targetKind: Schema.String,
  targetName: Schema.NonEmptyString,
  runtime: Schema.NonEmptyString,
  packageManager: Schema.NonEmptyString,
  projectName: Schema.NonEmptyString,
});

const Runtime = Schema.Union([
  Schema.TaggedStruct("bun", {}),
  Schema.TaggedStruct("node", {
    packageManager: Schema.Literals(["pnpm", "npm"]),
  }),
]);
export type Runtime = Schema.Schema.Type<typeof Runtime>;

export class StackConfig extends Schema.Class<StackConfig>("StackConfig")({
  name: Schema.NonEmptyString,
  runtime: Runtime,
  lint: Schema.optional(Schema.Literals(["biome"])),
  format: Schema.optional(Schema.Literals(["biome"])),
  test: Schema.optional(Schema.Literals(["vitest"])),
  monorepo: Schema.optional(Schema.Literals(["turbo"])),
}) {
  get runtimeName(): string {
    return this.runtime._tag;
  }

  get packageManagerName(): string {
    switch (this.runtime._tag) {
      case "bun":
        return "bun";
      case "node":
        return this.runtime.packageManager;
    }
  }
}
