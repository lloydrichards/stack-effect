import { Schema } from "effect";

const slugifyTargetName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const TargetKind = Schema.Union([
  Schema.Literal("client"),
  Schema.Literal("server"),
  Schema.Literal("cli"),
  Schema.Literal("package"),
]);
export type TargetKind = Schema.Schema.Type<typeof TargetKind>;

export const ModuleId = Schema.Union([
  Schema.Literal("domain-api"),
  Schema.Literal("http-api-server"),
]);
export type ModuleId = Schema.Schema.Type<typeof ModuleId>;

export class TargetIdentity extends Schema.Class<TargetIdentity>(
  "TargetIdentity",
)({
  kind: TargetKind,
  name: Schema.NonEmptyString,
}) {
  toPath(): TargetPath {
    switch (this.kind) {
      case "package":
        return `packages/${slugifyTargetName(this.name)}` as TargetPath;
      case "server":
      case "client":
      case "cli":
        return `apps/${this.kind}-${slugifyTargetName(this.name)}` as TargetPath;
    }
  }

  toKey(): TargetKey {
    switch (this.kind) {
      case "package":
        return `packages/${slugifyTargetName(this.name)}` as TargetKey;
      case "server":
      case "client":
      case "cli":
        return `apps/${this.kind}-${slugifyTargetName(this.name)}` as TargetKey;
    }
  }

  matches(supportedOn: SupportedOn): boolean {
    switch (supportedOn._tag) {
      case "identity":
        return supportedOn.identity.toKey() === this.toKey();
      case "kind":
        return supportedOn.kind === this.kind;
    }
  }
}

export const TargetKey = Schema.String.pipe(Schema.brand("TargetKey"));
export type TargetKey = Schema.Schema.Type<typeof TargetKey>;

export const TargetPath = Schema.String.pipe(Schema.brand("TargetPath"));
export type TargetPath = Schema.Schema.Type<typeof TargetPath>;

export const SupportedOn = Schema.Union([
  Schema.TaggedStruct("kind", {
    kind: TargetKind,
  }),
  Schema.TaggedStruct("identity", {
    identity: TargetIdentity,
  }),
]);
export type SupportedOn = Schema.Schema.Type<typeof SupportedOn>;

export const RequiredTarget = Schema.Struct({
  identity: TargetIdentity,
});
export type RequiredTarget = Schema.Schema.Type<typeof RequiredTarget>;

export const RequiredModule = Schema.Struct({
  target: TargetIdentity,
  moduleId: ModuleId,
});
export type RequiredModule = Schema.Schema.Type<typeof RequiredModule>;

export const ModuleDependency = Schema.Struct({
  requiredTarget: Schema.optional(RequiredTarget),
  requiredModule: Schema.optional(RequiredModule),
});
export type ModuleDependency = Schema.Schema.Type<typeof ModuleDependency>;

export const ContributionFile = Schema.Struct({
  path: Schema.String,
  contents: Schema.String,
});
export type ContributionFile = Schema.Schema.Type<typeof ContributionFile>;

export const ContributionPackageJsonExport = Schema.Struct({
  packageJsonPath: Schema.String,
  exportKey: Schema.String,
  exportValue: Schema.String,
});
export type ContributionPackageJsonExport = Schema.Schema.Type<
  typeof ContributionPackageJsonExport
>;

export const ContributionPackageJsonDependency = Schema.Struct({
  packageJsonPath: Schema.String,
  section: Schema.Union([
    Schema.Literal("dependencies"),
    Schema.Literal("devDependencies"),
  ]),
  dependencyName: Schema.String,
  dependencyValue: Schema.String,
});
export type ContributionPackageJsonDependency = Schema.Schema.Type<
  typeof ContributionPackageJsonDependency
>;

export const ContributionPackageJsonScript = Schema.Struct({
  packageJsonPath: Schema.String,
  scriptName: Schema.String,
  scriptValue: Schema.String,
});
export type ContributionPackageJsonScript = Schema.Schema.Type<
  typeof ContributionPackageJsonScript
>;

export const ContributionBarrelExport = Schema.Struct({
  barrelPath: Schema.String,
  exportPath: Schema.String,
});
export type ContributionBarrelExport = Schema.Schema.Type<
  typeof ContributionBarrelExport
>;

export const ContributionTsconfig = Schema.Struct({
  path: Schema.String,
  contents: Schema.String,
});
export type ContributionTsconfig = Schema.Schema.Type<
  typeof ContributionTsconfig
>;

export const DesiredContributions = Schema.Struct({
  files: Schema.Array(ContributionFile),
  packageJsonExports: Schema.Array(ContributionPackageJsonExport),
  packageJsonDependencies: Schema.Array(ContributionPackageJsonDependency),
  packageJsonScripts: Schema.Array(ContributionPackageJsonScript),
  barrelExports: Schema.Array(ContributionBarrelExport),
  tsconfigs: Schema.Array(ContributionTsconfig),
});
export type DesiredContributions = Schema.Schema.Type<
  typeof DesiredContributions
>;

export const emptyDesiredContributions = (): DesiredContributions => ({
  files: [],
  packageJsonExports: [],
  packageJsonDependencies: [],
  packageJsonScripts: [],
  barrelExports: [],
  tsconfigs: [],
});

export const TargetContribution = Schema.Struct({
  targetKey: TargetKey,
  contributions: DesiredContributions,
});
export type TargetContribution = Schema.Schema.Type<typeof TargetContribution>;

export const ModuleContribution = Schema.Struct({
  targetKey: TargetKey,
  moduleId: ModuleId,
  contributions: DesiredContributions,
});
export type ModuleContribution = Schema.Schema.Type<typeof ModuleContribution>;

export const ContributionTokenContext = Schema.Struct({
  targetKey: TargetKey,
  targetPath: TargetPath,
  targetKind: TargetKind,
  targetName: Schema.NonEmptyString,
});
export type ContributionTokenContext = Schema.Schema.Type<
  typeof ContributionTokenContext
>;
