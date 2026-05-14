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

  /**
   * Returns the package.json "name" field value for this target.
   * - Packages use scoped names: `@repo/<name>`
   * - Apps use their folder name: `<kind>` or `<kind>-<name>`
   */
  toPackageName(): string {
    const resolvedName = this.name.trim() || this.kind;
    switch (this.kind) {
      case "init":
        return resolvedName;
      case "package":
        return `@repo/${Str.kebabCase(resolvedName)}`;
      default:
        return this.name
          ? `${this.kind}-${Str.kebabCase(this.name.trim())}`
          : this.kind;
    }
  }

  matches(supportedOn: typeof SupportedOn.Type): boolean {
    return SupportedOn.match(supportedOn, {
      identity: (s) => s.identity.toKey() === this.toKey(),
      kind: (s) => s.kind === this.kind,
    });
  }
}

export const SupportedOn = Schema.TaggedUnion({
  kind: {
    kind: TargetKind,
  },
  identity: {
    identity: TargetIdentity,
  },
});

export const ScriptDefinition = Schema.Struct({
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

// =============================================================================
// Contributions
// =============================================================================

/**
 * A Contribution declares a single unit of desired repository state.
 *
 * Tagged union of contribution types:
 * - `file`: Authoritative file content (replaces entire file)
 * - `pkg-json-entry`: Entry in package.json (exports, dependencies, scripts)
 * - `barrel-export`: Re-export statement in a TypeScript barrel file
 * - `ts-call-arg`: Argument appended to a TypeScript function call
 */
export const Contribution = Schema.TaggedUnion({
  /**
   * Authoritative file content - the complete desired file.
   * Use `conflictOnModify: true` for files like tsconfig.json where
   * modification should surface as a conflict rather than overwrite.
   */
  file: {
    path: Schema.String,
    contents: Schema.String,
    conflictOnModify: Schema.optional(Schema.Boolean),
  },

  /**
   * Package.json entry - adds an entry to a specific field.
   * Field determines the JSON path: exports, dependencies, devDependencies, or scripts.
   */
  "pkg-json-entry": {
    path: Schema.String,
    field: Schema.Literals([
      "exports",
      "dependencies",
      "devDependencies",
      "scripts",
    ]),
    name: Schema.String,
    value: Schema.String,
  },

  /**
   * Barrel file re-export - adds `export * from "..."` to a barrel file.
   */
  "barrel-export": {
    barrelPath: Schema.String,
    exportPath: Schema.String,
  },

  /**
   * TypeScript call argument - appends an argument to a function call
   * and adds the necessary import statement.
   *
   * Used for Layer composition points like Layer.provide(), Layer.mergeAll().
   */
  "ts-call-arg": {
    path: Schema.String,
    targetVariable: Schema.String,
    functionName: Schema.String,
    argument: Schema.String,
    import: Schema.Struct({
      moduleSpecifier: Schema.String,
      namedImports: Schema.optional(Schema.Array(Schema.String)),
      defaultImport: Schema.optional(Schema.String),
    }),
  },
});

/**
 * A ModuleDependency declares a requirement that must be satisfied before
 * a module can be attached.
 *
 * Tagged union of dependency types:
 * - `required-target`: Target must exist as a workspace (no specific module required)
 * - `required-module`: Module must be attached to the specified target
 *                      (target existence is implicit - you can't attach a module to a non-existent target)
 */
export const ModuleDependency = Schema.TaggedUnion({
  /**
   * Target must exist as a workspace.
   * Use when the dependency is on the target itself, not a specific module.
   */
  "required-target": {
    identity: TargetIdentity,
  },

  /**
   * Module must be attached to the specified target.
   * Target existence is implicit - the BlueprintService will create both
   * a required-target edge and a required-module edge when resolving.
   */
  "required-module": {
    target: TargetIdentity,
    moduleId: ModuleId,
  },
});

export const Visibility = Schema.Literals(["public", "internal"]);

/**
 * Freeform tag for grouping modules into selectable categories.
 * Modules sharing a category are presented as alternatives in prompts.
 */
export const ModuleCategory = Schema.String.pipe(
  Schema.brand("ModuleCategory"),
);

export const ModuleDefinition = Schema.Struct({
  id: ModuleId,
  title: Schema.String,
  description: Schema.String,
  visibility: Visibility.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed("public" as const)),
  ),
  categories: Schema.Array(ModuleCategory).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  supportedOn: Schema.Array(SupportedOn),
  dependencies: Schema.Array(ModuleDependency),
  implies: Schema.Array(ModuleImplication).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  contributions: Schema.Array(Contribution),
  scripts: Schema.Array(ScriptDefinition).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
});

export const TargetDefinition = Schema.Struct({
  kind: TargetKind,
  title: Schema.String,
  description: Schema.String,
  visibility: Visibility.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed("public" as const)),
  ),
  requiredModules: Schema.Array(ModuleId).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  contributions: Schema.Array(Contribution),
  scripts: Schema.Array(ScriptDefinition).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
});

export const CatalogNode = Schema.TaggedUnion({
  target: {
    definition: TargetDefinition,
  },
  module: {
    definition: ModuleDefinition,
  },
});

export const CatalogEdge = Schema.Literals([
  "supportedOn",
  "requiredModule",
  "implies",
]);

export type CatalogGraph = Graph.DirectedGraph<
  typeof CatalogNode.Type,
  typeof CatalogEdge.Type
>;
