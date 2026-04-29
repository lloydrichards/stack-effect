import { Schema } from "effect";

export const ModuleId = Schema.Union([
  Schema.Literal("turbo"),
  Schema.Literal("biome"),
  Schema.Literal("vitest"),
  Schema.Literal("domain-api"),
  Schema.Literal("http-api-server"),
  Schema.Literal("http-api-client"),
]);

export const TargetKind = Schema.Union([
  Schema.Literal("init"),
  Schema.Literal("client"),
  Schema.Literal("server"),
  Schema.Literal("cli"),
  Schema.Literal("package"),
  Schema.String,
]);

const slugifyTargetName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const TargetPath = Schema.String.pipe(Schema.brand("TargetPath"));
export const TargetKey = Schema.String.pipe(Schema.brand("TargetKey"));

export class TargetIdentity extends Schema.Class<TargetIdentity>(
  "TargetIdentity",
)({
  kind: TargetKind,
  name: Schema.String,
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
          `apps/${this.kind}${this.name ? `-${slugifyTargetName(this.name)}` : ""}`,
        );
      default:
        return TargetPath.make(
          `apps/${this.kind}${this.name ? `-${slugifyTargetName(this.name)}` : ""}`,
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
          `apps/${this.kind}${this.name ? `-${slugifyTargetName(this.name)}` : ""}`,
        );
      default:
        return TargetKey.make(
          `apps/${this.name ? `-${slugifyTargetName(this.name)}` : ""}`,
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

export const ModuleDefinition = Schema.Struct({
  id: ModuleId,
  title: Schema.String,
  description: Schema.String,
  supportedOn: Schema.Array(SupportedOn),
  dependencies: Schema.Array(ModuleDependency),
  contributions: DesiredContributions,
});

export const TargetDefinition = Schema.Struct({
  kind: TargetKind,
  title: Schema.String,
  description: Schema.String,
  contributions: DesiredContributions,
});
