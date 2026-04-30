import { Data, Effect, type Graph, Schema, String as Str } from "effect";

export class CatalogNotFound extends Data.TaggedError("CatalogNotFound")<{
  catalog: "target" | "module";
  entity: "target-kind" | "module";
  id: string;
}> {}

export const ModuleId = Schema.String.pipe(Schema.brand("ModuleId"));

export const TargetKind = Schema.Union([
  Schema.Literal("init"),
  Schema.Literal("package"),
  Schema.String,
]).pipe(Schema.brand("TargetKind"));

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
        return TargetPath.make(`packages/${Str.kebabCase(this.name.trim())}`);
      default:
        return TargetPath.make(
          `apps/${this.kind}${this.name ? `-${Str.kebabCase(this.name.trim())}` : ""}`,
        );
    }
  }

  toKey(): typeof TargetKey.Type {
    switch (this.kind) {
      case "init":
        return TargetKey.make(".");
      case "package":
        return TargetKey.make(`packages/${Str.kebabCase(this.name.trim())}`);
      default:
        return TargetKey.make(
          `apps/${this.kind}${this.name ? `-${Str.kebabCase(this.name.trim())}` : ""}`,
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

export const ScriptPhase = Schema.Literals(["post", "finalize"]);

export const ScriptDefinition = Schema.Struct({
  phase: ScriptPhase,
  label: Schema.String,
  command: Schema.String,
  workdir: Schema.String.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed("{{targetPath}}")),
  ),
});

export const ModuleImplication = Schema.Struct({
  targetKind: TargetKind,
  moduleId: ModuleId,
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
  dependencies: Schema.Array(
    Schema.Struct({
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
    }),
  ),
  implies: Schema.Array(ModuleImplication).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  contributions: DesiredContributions,
  scripts: Schema.Array(ScriptDefinition).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
});

export const TargetDefinition = Schema.Struct({
  kind: TargetKind,
  title: Schema.String,
  description: Schema.String,
  requiredModules: Schema.Array(ModuleId).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  contributions: DesiredContributions,
  scripts: Schema.Array(ScriptDefinition).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
});

export const CatalogNode = Schema.Union([
  Schema.TaggedStruct("target", {
    definition: TargetDefinition,
  }),
  Schema.TaggedStruct("module", {
    definition: ModuleDefinition,
  }),
]);

export const CatalogEdge = Schema.Literals([
  "supportedOn",
  "requiredModule",
  "implies",
]);

export type CatalogGraph = Graph.DirectedGraph<
  typeof CatalogNode.Type,
  typeof CatalogEdge.Type
>;
