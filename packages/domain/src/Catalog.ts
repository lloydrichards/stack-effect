import {
  Data,
  Effect,
  type Graph,
  Result,
  Schema,
  String as Str,
} from "effect";

export class CatalogNotFound extends Data.TaggedError("CatalogNotFound")<{
  catalog: "target" | "module";
  entity: "target-kind" | "module";
  id: string;
}> {
  override get message(): string {
    return `Catalog ${this.entity} "${this.id}" was not found.`;
  }
}

export const ModuleId = Schema.String.pipe(Schema.brand("ModuleId"));

export const ModuleCapability = Schema.String.pipe(
  Schema.brand("ModuleCapability"),
);

const isSafeTargetSegment = (segment: string): boolean => {
  const trimmed = segment.trim();
  const normalized = Str.kebabCase(trimmed);
  return (
    trimmed.length > 0 &&
    !trimmed.startsWith(".") &&
    !/[\\:\0]/.test(trimmed) &&
    normalized.length > 0 &&
    normalized !== "node-modules" &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(normalized)
  );
};

export const TargetName = Schema.String.check(
  Schema.makeFilter(
    (name) =>
      name.trim() === "" ||
      name.split("/").every(isSafeTargetSegment) ||
      "Target names must contain safe, non-empty directory segments",
  ),
);

export const TargetKind = Schema.String.check(
  Schema.makeFilter(
    (kind) =>
      (!kind.includes("/") &&
        isSafeTargetSegment(kind) &&
        kind === Str.kebabCase(kind)) ||
      "Target kinds must be canonical safe directory segments",
  ),
).pipe(Schema.brand("TargetKind"));

export const TargetPath = Schema.String.pipe(Schema.brand("TargetPath"));

/** Directory ownership overlaps only at complete segment boundaries. */
export const targetPathsOverlap = (left: string, right: string): boolean => {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
};
export const TargetKey = Schema.String.pipe(Schema.brand("TargetKey"));

export class TargetIdentity extends Schema.Class<TargetIdentity>(
  "TargetIdentity",
)(
  Schema.Struct({
    kind: TargetKind,
    name: TargetName,
  }).check(
    Schema.makeFilter(
      (identity) =>
        identity.kind !== "package" ||
        identity.name.trim().length > 0 ||
        "Package targets require a non-empty name",
    ),
  ),
) {
  hasExplicitName(): boolean {
    return targetNameSlug(this).length > 0;
  }

  toPath(): typeof TargetPath.Type {
    return TargetPath.make(toTargetPathString(this));
  }

  toKey(): typeof TargetKey.Type {
    return TargetKey.make(toTargetPathString(this));
  }

  /**
   * Returns the package.json "name" field value for this target.
   * - Packages use scoped names: `@repo/<name>`
   * - Apps use flat names: `<kind>` or `<kind>-<name>`
   * Hierarchical name segments are joined with hyphens for npm names.
   */
  toPackageName(): string {
    const slug = targetNameSlug(this);
    const resolvedName = slug || this.kind;
    switch (this.kind) {
      case "workspace":
        return resolvedName;
      case "package":
        return `@repo/${resolvedName}`;
      default:
        return slug ? `${this.kind}-${slug}` : this.kind;
    }
  }

  matches(supportedOn: typeof SupportedOn.Type): boolean {
    return SupportedOn.match(supportedOn, {
      identity: (s) => s.identity.toKey() === this.toKey(),
      kind: (s) => s.kind === this.kind,
    });
  }
}

const targetNameSlug = (identity: TargetIdentity): string =>
  identity.name
    .trim()
    .split("/")
    .map((segment) => Str.kebabCase(segment.trim()))
    .join("-");

const toTargetPathString = (identity: TargetIdentity): string => {
  const segments =
    identity.name.trim() === ""
      ? []
      : identity.name
          .split("/")
          .map((segment) => Str.kebabCase(segment.trim()));
  const leaf = segments.at(-1) ?? "";
  const group = segments.slice(0, -1);

  switch (identity.kind) {
    case "workspace":
      return ".";
    case "package":
      return `packages/${segments.join("/")}`;
    default:
      return [
        "apps",
        ...group,
        `${identity.kind}${leaf ? `-${leaf}` : ""}`,
      ].join("/");
  }
};

export const SupportedOn = Schema.TaggedUnion({
  kind: {
    kind: TargetKind,
  },
  identity: {
    identity: TargetIdentity,
  },
});

export const ScriptPhase = Schema.Literals(["finalize", "post-finalize"]);

export const ScriptDefinition = Schema.Struct({
  label: Schema.String,
  command: Schema.String,
  workdir: Schema.String.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed("{{targetPath}}")),
  ),
  phase: ScriptPhase.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed("finalize" as const)),
  ),
});

export const ModuleImplication = Schema.Struct({
  targetKind: TargetKind,
  moduleId: ModuleId,
});

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
      namespaceImport: Schema.optional(Schema.String),
    }),
  },

  /**
   * TypeScript object field - adds a property to an object literal argument
   * of a function call on a named variable.
   *
   * Used for composing Schema.Struct fields, Match.tagsExhaustive cases, etc.
   */
  "ts-object-field": {
    path: Schema.String,
    targetVariable: Schema.String,
    functionName: Schema.String,
    field: Schema.String,
    value: Schema.String,
    import: Schema.optional(
      Schema.Struct({
        moduleSpecifier: Schema.String,
        namedImports: Schema.optional(Schema.Array(Schema.String)),
        defaultImport: Schema.optional(Schema.String),
        namespaceImport: Schema.optional(Schema.String),
      }),
    ),
  },

  /**
   * JSX slot injection - inserts content at a named slot marker in a file.
   *
   * Template files use `@slot:<slotId>` block comments as injection points.
   * Multiple contributions targeting the same slot are concatenated in order.
   * Optionally adds import statements to the top of the file.
   */
  "jsx-slot": {
    path: Schema.String,
    slotId: Schema.String,
    content: Schema.String,
    import: Schema.optional(
      Schema.Struct({
        moduleSpecifier: Schema.String,
        namedImports: Schema.optional(Schema.Array(Schema.String)),
        defaultImport: Schema.optional(Schema.String),
        namespaceImport: Schema.optional(Schema.String),
      }),
    ),
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
 * - `required-capability`: Target must have a module that provides a capability
 *                          such as `db-sql`. CLI prompts should resolve this to
 *                          a concrete provider module before Blueprint resolution.
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

  /**
   * Target must have a module that provides the requested capability.
   * Interactive selection resolves this to a concrete provider module before
   * Blueprint resolution; Blueprint treats unresolved capabilities as invalid.
   */
  "required-capability": {
    target: TargetIdentity,
    capability: ModuleCapability,
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

/**
 * Declares a parent-child relationship between modules on the same target.
 * Used by the TUI to render nested selection trees.
 *
 * - `required` children are auto-selected when the parent is selected (display-only)
 * - `optional` children can be toggled by the user
 *
 * Children must share at least one `supportedOn` rule with their parent.
 */
export const ModuleChild = Schema.Struct({
  moduleId: ModuleId,
  requirement: Schema.Literals(["required", "optional"]),
});

export const SupportedRuntime = Schema.Literals(["bun", "node", "deno"]);

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
  provides: Schema.Array(ModuleCapability).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  supportedOn: Schema.Array(SupportedOn),
  supportedRuntimes: Schema.optional(Schema.Array(SupportedRuntime)),
  dependencies: Schema.Array(ModuleDependency),
  implies: Schema.Array(ModuleImplication).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  conflictsWith: Schema.Array(ModuleId).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  /**
   * Same-target child modules shown in nested selection UI.
   * Children must share at least one `supportedOn` rule with the parent.
   */
  children: Schema.Array(ModuleChild).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  contributions: Schema.Array(Contribution),
  scripts: Schema.Array(ScriptDefinition).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  nextSteps: Schema.Array(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
});

export const TargetDefinition = Schema.Struct({
  kind: TargetKind,
  title: Schema.String,
  description: Schema.String,
  /**
   * Default target name for greenfield non-interactive creation.
   *
   * Used by `create` when an implication needs a missing target and by `add`
   * when the user supplies an empty target name such as
   * `--target server/:server-chat-rpc`. Identity-specific package
   * modules should remain explicit.
   */
  defaultName: Schema.optional(TargetName),
  visibility: Visibility.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed("public" as const)),
  ),
  requiredModules: Schema.Array(ModuleId).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  supportedRuntimes: Schema.optional(Schema.Array(SupportedRuntime)),
  contributions: Schema.Array(Contribution),
  scripts: Schema.Array(ScriptDefinition).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  nextSteps: Schema.Array(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
}).check(
  Schema.makeFilter(
    ({ kind, defaultName }) =>
      defaultName === undefined ||
      Result.isSuccess(
        Schema.decodeResult(TargetIdentity)({ kind, name: defaultName }),
      ) ||
      "Default target names must be valid for their target kind",
  ),
);

export const CatalogFragment = Schema.Struct({
  targets: Schema.Array(TargetDefinition),
  modules: Schema.Array(ModuleDefinition),
});

export type CatalogFragment = typeof CatalogFragment.Type;

export const CatalogDocument = Schema.Struct({
  formatVersion: Schema.Literal(1),
  catalogId: Schema.NonEmptyString,
  requiredCapabilities: Schema.Array(Schema.String),
  /** Selected sources this document may reference. v1 accepts only the official source. */
  requires: Schema.optionalKey(Schema.Array(Schema.Literal("official"))),
  targets: Schema.Array(TargetDefinition),
  modules: Schema.Array(ModuleDefinition),
});

export type CatalogDocument = typeof CatalogDocument.Type;

/** The Catalog definition an issue belongs to, so authoring tools can locate it. */
export const CatalogIssueSubject = Schema.TaggedUnion({
  module: { id: Schema.String },
  target: { kind: Schema.String },
  document: {},
});
export type CatalogIssueSubject = typeof CatalogIssueSubject.Type;

/** Human label for an issue subject, as used in validation messages. */
export const catalogIssueLabel = (subject: CatalogIssueSubject): string =>
  CatalogIssueSubject.match(subject, {
    module: ({ id }) => `Module ${id}`,
    target: ({ kind }) => `Target ${kind}`,
    document: () => "Catalog",
  });

/** Stable key identifying the definition an issue subject names. */
export const catalogIssueKey = (subject: CatalogIssueSubject): string =>
  CatalogIssueSubject.match(subject, {
    module: ({ id }) => `module:${id}`,
    target: ({ kind }) => `target:${kind}`,
    document: () => "document",
  });

export const CatalogIssueCode = Schema.Literals([
  "invalid-shape",
  "duplicate-id",
  "missing-reference",
  "unsupported-target",
  "unavailable-capability",
  "asymmetric-conflict",
  "finalize-script",
  "undeclared-reference",
  "missing-source",
  "cross-source-conflict",
]);
export type CatalogIssueCode = typeof CatalogIssueCode.Type;

export const CatalogIssue = Schema.Struct({
  subject: CatalogIssueSubject,
  code: CatalogIssueCode,
  message: Schema.String,
  fragment: Schema.optionalKey(Schema.Int),
});
export type CatalogIssue = typeof CatalogIssue.Type;

/** An interpreter capability outside the v1 set, or used without being declared. */
export const CatalogCapabilityIssue = Schema.Struct({
  subject: CatalogIssueSubject,
  capability: Schema.String,
});
export type CatalogCapabilityIssue = typeof CatalogCapabilityIssue.Type;

export class CatalogValidationError extends Data.TaggedError(
  "CatalogValidationError",
)<{ readonly details: ReadonlyArray<CatalogIssue> }> {
  get issues(): ReadonlyArray<string> {
    return this.details.map((issue) => issue.message);
  }

  override get message(): string {
    return `Invalid catalog: ${this.issues.join("; ")}`;
  }
}

export class CatalogCapabilityError extends Data.TaggedError(
  "CatalogCapabilityError",
)<{ readonly details: ReadonlyArray<CatalogCapabilityIssue> }> {
  get capabilities(): ReadonlyArray<string> {
    return [...new Set(this.details.map((issue) => issue.capability))];
  }

  override get message(): string {
    return `Catalog requires unsupported or undeclared interpreter capabilities: ${this.capabilities.join(", ")}`;
  }
}

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
  "childOf",
]);

export type CatalogGraph = Graph.DirectedGraph<
  typeof CatalogNode.Type,
  typeof CatalogEdge.Type
>;

/**
 * A module entry within the catalog tree, showing what it requires and implies
 * so an LLM can understand the consequences of selecting it.
 */
export const CatalogTreeModule = Schema.Struct({
  id: ModuleId,
  title: Schema.String,
  description: Schema.String,
  categories: Schema.Array(ModuleCategory),
  requires: Schema.Array(
    Schema.Struct({
      targetKind: TargetKind,
      targetName: Schema.String,
      moduleId: ModuleId,
    }),
  ),
  requiredCapabilities: Schema.Array(
    Schema.Struct({
      targetKind: TargetKind,
      targetName: Schema.String,
      capability: ModuleCapability,
    }),
  ),
  provides: Schema.Array(ModuleCapability),
  implies: Schema.Array(ModuleImplication),
  conflictsWith: Schema.Array(ModuleId),
});

/**
 * A target node in the catalog tree with its available modules nested inside.
 * This makes it trivial to see "for target X, I can pick modules [A, B, C]"
 * along with their dependency/implication edges.
 */
export const CatalogTreeTarget = Schema.Struct({
  kind: TargetKind,
  title: Schema.String,
  description: Schema.String,
  requiredModules: Schema.Array(ModuleId),
  modules: Schema.Array(CatalogTreeModule),
});

/**
 * The full catalog as a tree: targets at the top level, modules nested within.
 * Designed for LLM consumption where the question is "what can I select?"
 */
export const CatalogTree = Schema.Struct({
  targets: Schema.Array(CatalogTreeTarget),
});
