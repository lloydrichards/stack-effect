import { Schema } from "effect";

const slugifyTargetName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const TargetKind = Schema.Union([
  Schema.Literal("init"),
  Schema.Literal("client"),
  Schema.Literal("server"),
  Schema.Literal("cli"),
  Schema.Literal("package"),
]);

export const ModuleId = Schema.Union([
  Schema.Literal("turbo"),
  Schema.Literal("biome"),
  Schema.Literal("vitest"),
  Schema.Literal("domain-api"),
  Schema.Literal("http-api-server"),
  Schema.Literal("http-api-client"),
]);

export class TargetIdentity extends Schema.Class<TargetIdentity>(
  "TargetIdentity",
)({
  kind: TargetKind,
  name: Schema.NonEmptyString,
}) {
  toPath(): typeof TargetPath.Type {
    switch (this.kind) {
      case "init":
        return TargetPath.make(".");
      case "package":
        return TargetPath.make(`packages/${slugifyTargetName(this.name)}`);
      case "server":
      case "client":
      case "cli":
        return TargetPath.make(
          `apps/${this.kind}-${slugifyTargetName(this.name)}`,
        );
    }
  }

  toKey(): typeof TargetKey.Type {
    switch (this.kind) {
      case "init":
        return TargetKey.make(".");
      case "package":
        return TargetKey.make(`packages/${slugifyTargetName(this.name)}`);
      case "server":
      case "client":
      case "cli":
        return TargetKey.make(
          `apps/${this.kind}-${slugifyTargetName(this.name)}`,
        );
    }
  }

  matches(supportedOn: typeof SupportedOn.Type): boolean {
    switch (supportedOn._tag) {
      case "identity":
        return supportedOn.identity.toKey() === this.toKey();
      case "kind":
        return supportedOn.kind === this.kind;
    }
  }
}

const targetKeyPattern =
  /^(?:\.|packages\/[a-z0-9]+(?:-[a-z0-9]+)*|apps\/(?:client|server|cli)-[a-z0-9]+(?:-[a-z0-9]+)*)$/;

const isCanonicalTargetKey = (value: string): value is string =>
  targetKeyPattern.test(value);

export const TargetKey = Schema.String.pipe(
  Schema.refine(isCanonicalTargetKey, {
    identifier: "TargetKey",
    description:
      "A canonical target key: packages/<name> or apps/<kind>-<name>.",
  }),
  Schema.brand("TargetKey"),
);

export const TargetPath = Schema.String.pipe(Schema.brand("TargetPath"));

export const SupportedOn = Schema.Union([
  Schema.TaggedStruct("kind", {
    kind: TargetKind,
  }),
  Schema.TaggedStruct("identity", {
    identity: TargetIdentity,
  }),
]);

export const ModuleDependency = Schema.Struct({
  requiredTarget: Schema.optional(
    Schema.Struct({
      identity: TargetIdentity,
    }),
  ),
  requiredModule: Schema.optional(
    Schema.Struct({
      target: TargetIdentity,
      moduleId: ModuleId,
    }),
  ),
});

export const DesiredContributions = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      contents: Schema.String,
    }),
  ),
  exports: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      name: Schema.String,
      value: Schema.String,
    }),
  ),
  dependencies: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      section: Schema.Union([
        Schema.Literal("dependencies"),
        Schema.Literal("devDependencies"),
      ]),
      name: Schema.String,
      value: Schema.String,
    }),
  ),
  scripts: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      name: Schema.String,
      value: Schema.String,
    }),
  ),
  barrelExports: Schema.Array(
    Schema.Struct({
      barrelPath: Schema.String,
      exportPath: Schema.String,
    }),
  ),
  tsconfigs: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      contents: Schema.String,
    }),
  ),
});

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
  targetPath: TargetPath,
  targetKind: TargetKind,
  targetName: Schema.NonEmptyString,
});
