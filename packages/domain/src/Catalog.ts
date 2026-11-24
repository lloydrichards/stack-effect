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

export type ModuleId = typeof ModuleId.Type;

export const ModuleCapability = Schema.String.pipe(
  Schema.brand("ModuleCapability"),
);

export type ModuleCapability = typeof ModuleCapability.Type;

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

export type TargetKind = typeof TargetKind.Type;

const TargetPath = Schema.String.pipe(Schema.brand("TargetPath"));

export type TargetPath = typeof TargetPath.Type;

/** Directory ownership overlaps only at complete segment boundaries. */
export const targetPathsOverlap = (left: string, right: string): boolean => {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
};
export const TargetKey = Schema.String.pipe(Schema.brand("TargetKey"));

export type TargetKey = typeof TargetKey.Type;

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

  // fallow-ignore-next-line unused-class-member -- called by BlueprintResolver.resolve and packageOwnership
  toPath(): TargetPath {
    return TargetPath.make(toTargetPathString(this));
  }

  toKey(): TargetKey {
    return TargetKey.make(toTargetPathString(this));
  }

  /**
   * Returns the package.json "name" field value for this target.
   * - Packages use scoped names: `@repo/<name>`
   * - Apps use flat names: `<kind>` or `<kind>-<name>`
   * Hierarchical name segments are joined with hyphens for npm names.
   */
  // fallow-ignore-next-line unused-class-member -- called by BlueprintResolver.resolve and packageOwnership
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

  matches(supportedOn: SupportedOn): boolean {
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

const SupportedOn = Schema.TaggedUnion({
  kind: {
    kind: TargetKind,
  },
  identity: {
    identity: TargetIdentity,
  },
});

export type SupportedOn = typeof SupportedOn.Type;

const ScriptPhase = Schema.Literals(["finalize", "post-finalize"]);

const ScriptDefinition = Schema.Struct({
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

const ModuleImplication = Schema.Struct({
  targetKind: TargetKind,
  moduleId: ModuleId,
});

export type ModuleImplication = typeof ModuleImplication.Type;

/**
 * A Contribution declares a single unit of desired repository state.
 *
 * Tagged union of contribution types:
 * - `file`: Authoritative file content (replaces entire file)
 * - `pkg-json-entry`: Entry in package.json (exports, dependencies, scripts)
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

export type Contribution = typeof Contribution.Type;

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
   * Target existence is implicit - the BlueprintResolver will create both
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

export type ModuleDependency = typeof ModuleDependency.Type;

const Visibility = Schema.Literals(["public", "internal"]);

export type Visibility = typeof Visibility.Type;

/**
 * Freeform tag for grouping modules into selectable categories.
 * Modules sharing a category are presented as alternatives in prompts.
 */
export const ModuleCategory = Schema.String.pipe(
  Schema.brand("ModuleCategory"),
);

export type ModuleCategory = typeof ModuleCategory.Type;

/**
 * Declares a parent-child relationship between modules on the same target.
 * Used by the TUI to render nested selection trees.
 *
 * - `required` children are auto-selected when the parent is selected (display-only)
 * - `optional` children can be toggled by the user
 *
 * Children must share at least one `supportedOn` rule with their parent.
 */
const ModuleChild = Schema.Struct({
  moduleId: ModuleId,
  requirement: Schema.Literals(["required", "optional"]),
});

export type ModuleChild = typeof ModuleChild.Type;

export const SupportedRuntime = Schema.Literals(["bun", "node", "deno"]);

export type SupportedRuntime = typeof SupportedRuntime.Type;

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

export type ModuleDefinition = typeof ModuleDefinition.Type;

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

export type TargetDefinition = typeof TargetDefinition.Type;

/** A target or module definition from a Catalog. */
const CatalogDefinition = Schema.Union([TargetDefinition, ModuleDefinition]);

export type CatalogDefinition = typeof CatalogDefinition.Type;

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

const CatalogIssue = Schema.Struct({
  subject: CatalogIssueSubject,
  code: CatalogIssueCode,
  message: Schema.String,
  fragment: Schema.optional(Schema.Int),
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

const CatalogNode = Schema.TaggedUnion({
  target: {
    definition: TargetDefinition,
  },
  module: {
    definition: ModuleDefinition,
  },
});

export type CatalogNode = typeof CatalogNode.Type;

const CatalogEdge = Schema.Literals([
  "supportedOn",
  "requiredModule",
  "implies",
  "childOf",
]);

export type CatalogEdge = typeof CatalogEdge.Type;

export type CatalogGraph = Graph.DirectedGraph<CatalogNode, CatalogEdge>;

/**
 * A module entry within the catalog tree, showing what it requires and implies
 * so an LLM can understand the consequences of selecting it.
 */
const CatalogTreeModule = Schema.Struct({
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
const CatalogTreeTarget = Schema.Struct({
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

/** Reserved source name whose URL the application supplies. */
export const OFFICIAL_CATALOG_SOURCE = "official";

/** `catalogId` of the official catalog document. */
export const OFFICIAL_CATALOG_ID = "stack-effect-official";

/** Production URL of the official catalog document. */
export const OFFICIAL_CATALOG_URL =
  "https://stack-effect.lloydrichards.dev/registry/v1/catalog.json";

const CatalogSourceName = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]{0,31}$/, {
    message:
      "Catalog source names must start with a lowercase letter and contain at most 32 lowercase letters, digits, or hyphens",
  }),
  Schema.makeFilter((name) =>
    name === OFFICIAL_CATALOG_SOURCE
      ? `"${OFFICIAL_CATALOG_SOURCE}" is reserved and takes no url`
      : undefined,
  ),
).pipe(Schema.brand("CatalogSourceName"));

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Domain code has no WHATWG URL global, so split the parts the rules need.
const absoluteUrl =
  /^(?<scheme>[a-z][a-z0-9+.-]*):\/\/(?<authority>[^/?#\s]*)[^#\s]*$/i;
const hostAndPort = /^(?<host>\[[0-9a-f:.]+\]|[^:[\]]+)(?::(?<port>\d+))?$/i;

const catalogUrlIssue = (value: string): string | undefined => {
  const parts = absoluteUrl.exec(value)?.groups;
  const scheme = parts?.["scheme"]?.toLowerCase();
  const authority = parts?.["authority"] ?? "";
  const address = hostAndPort.exec(authority)?.groups;
  const host = address?.["host"]?.toLowerCase();
  const port = Number(address?.["port"] ?? 0);
  return value.includes("#")
    ? `Catalog URL must not contain a fragment: ${value}`
    : parts === undefined
      ? `Catalog URL must be absolute, without whitespace: ${value}`
      : authority.includes("@")
        ? "Catalog URL must not contain credentials"
        : host === undefined || port > 65_535
          ? `Catalog URL must name a host and a valid port: ${value}`
          : scheme !== "https" && scheme !== "http"
            ? `Catalog URL must use https: ${value}`
            : scheme === "http" && !loopbackHosts.has(host)
              ? `Catalog URL must use https unless it targets a loopback host: ${value}`
              : undefined;
};

/** Absolute https URL, or http on a loopback host for local previews. */
const CatalogSourceUrl = Schema.String.check(
  Schema.makeFilter(catalogUrlIssue),
).pipe(Schema.brand("CatalogSourceUrl"));

const OfficialCatalogSource = Schema.Struct({
  name: Schema.Literal(OFFICIAL_CATALOG_SOURCE),
  url: Schema.optionalKey(Schema.Never),
});

export const CustomCatalogSource = Schema.Struct({
  name: CatalogSourceName,
  url: CatalogSourceUrl,
});

const CatalogSource = Schema.Union([
  OfficialCatalogSource,
  CustomCatalogSource,
]);
export type CatalogSource = typeof CatalogSource.Type;

const duplicates = (values: ReadonlyArray<string>) => [
  ...new Set(values.filter((value, index) => values.indexOf(value) !== index)),
];

/** An explicit, non-empty selection. Order is kept for display only. */
export const CatalogSources = Schema.NonEmptyArray(CatalogSource).check(
  Schema.makeFilter((sources) => [
    ...duplicates(sources.map((source) => source.name)).map(
      (name) => `Catalog source ${name} is listed more than once`,
    ),
    ...duplicates(
      sources.flatMap((source) => ("url" in source ? [source.url] : [])),
    ).map((url) => `Catalog URL ${url} is listed under more than one name`),
  ]),
);
export type CatalogSources = typeof CatalogSources.Type;

/** Absent configuration selects only the official source. */
export const defaultCatalogSources: CatalogSources = [
  { name: OFFICIAL_CATALOG_SOURCE },
];

/** `name` for the official source, `name=url` otherwise, as the CLI flag spells it. */
export const formatCatalogSource = (source: CatalogSource): string =>
  "url" in source ? `${source.name}=${source.url}` : source.name;

export const formatCatalogSources = (sources: ReadonlyArray<CatalogSource>) =>
  sources.map(formatCatalogSource).join(", ");

/** Order carries no meaning, so compare selections as sets. */
export const sameCatalogSources = (a: CatalogSources, b: CatalogSources) => {
  const keys = new Set(a.map(formatCatalogSource));
  return (
    a.length === b.length &&
    b.every((source) => keys.has(formatCatalogSource(source)))
  );
};

export const selectsOfficialCatalog = (sources: ReadonlyArray<CatalogSource>) =>
  sources.some((source) => source.name === OFFICIAL_CATALOG_SOURCE);

/** A named source other than the official one; its scripts need explicit trust. */
export const isCustomCatalogSource = (name: string | undefined) =>
  name !== undefined && name !== OFFICIAL_CATALOG_SOURCE;

/**
 * One validated catalog document as a cache stores it.
 *
 * **When to use**
 *
 * Implement a `CatalogCache` adapter, such as a file or IndexedDB store.
 *
 * **Gotchas**
 *
 * Adapters must publish the complete entry atomically and return a copy of
 * `bytes`, so a caller cannot mutate the stored document.
 */
export const CatalogCacheEntry = Schema.Struct({
  sourceUrl: Schema.String,
  bytes: Schema.Uint8Array,
  digest: Schema.String,
  etag: Schema.optional(Schema.String),
  lastModified: Schema.optional(Schema.String),
  validatedAt: Schema.Number,
});
export type CatalogCacheEntry = typeof CatalogCacheEntry.Type;

/**
 * A cache adapter could not read or write an entry.
 *
 * **When to use**
 *
 * Fail a `CatalogCache` operation with it. Catalog loading treats it as a
 * cache miss or a persistence warning, never as a load failure.
 */
export class CatalogCacheFailure extends Schema.TaggedError<CatalogCacheFailure>()(
  "CatalogCacheFailure",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

/** The source cannot be fetched as given, such as a URL that is not `http:` or `https:`. */
export class CatalogSourceInvalid extends Schema.TaggedError<CatalogSourceInvalid>()(
  "CatalogSourceInvalid",
  {},
) {}

/** A transient fetch failure; a cached document may stand in for it. */
export class CatalogUnavailable extends Schema.TaggedError<CatalogUnavailable>()(
  "CatalogUnavailable",
  {
    /** The retryable HTTP status the server answered with, if any. */
    status: Schema.optional(Schema.Int),
  },
) {}

/** The catalog request did not finish within the load timeout. */
export class CatalogTimedOut extends Schema.TaggedError<CatalogTimedOut>()(
  "CatalogTimedOut",
  { timeoutMillis: Schema.Int },
) {}

/** The server answered with a status that retrying will not fix. */
export class CatalogHttpStatusRejected extends Schema.TaggedError<CatalogHttpStatusRejected>()(
  "CatalogHttpStatusRejected",
  { status: Schema.Int },
) {}

/** The response is not served as JSON. */
export class CatalogContentTypeInvalid extends Schema.TaggedError<CatalogContentTypeInvalid>()(
  "CatalogContentTypeInvalid",
  { contentType: Schema.String },
) {}

/** The response is not UTF-8 JSON. */
export class CatalogJsonInvalid extends Schema.TaggedError<CatalogJsonInvalid>()(
  "CatalogJsonInvalid",
  {},
) {}

/** The JSON is not a valid catalog document. */
export class CatalogDocumentInvalid extends Schema.TaggedError<CatalogDocumentInvalid>()(
  "CatalogDocumentInvalid",
  {},
) {}

/** The document declares a format version this build cannot read. */
export class CatalogFormatUnsupported extends Schema.TaggedError<CatalogFormatUnsupported>()(
  "CatalogFormatUnsupported",
  {},
) {}

/** The document requires a capability this build does not support. */
export class CatalogCapabilityUnsupported extends Schema.TaggedError<CatalogCapabilityUnsupported>()(
  "CatalogCapabilityUnsupported",
  {},
) {}

/** The response exceeds the maximum catalog size. */
export class CatalogContentTooLarge extends Schema.TaggedError<CatalogContentTooLarge>()(
  "CatalogContentTooLarge",
  { maxBytes: Schema.Int },
) {}

/**
 * Why one catalog source could not be loaded.
 *
 * **When to use**
 *
 * Match on `CatalogLoadFailure.reason._tag` to choose a message or a retry.
 * Only `CatalogUnavailable` and `CatalogTimedOut` are transient.
 */
const CatalogLoadReason = Schema.Union([
  CatalogSourceInvalid,
  CatalogUnavailable,
  CatalogTimedOut,
  CatalogHttpStatusRejected,
  CatalogContentTypeInvalid,
  CatalogJsonInvalid,
  CatalogDocumentInvalid,
  CatalogFormatUnsupported,
  CatalogCapabilityUnsupported,
  CatalogContentTooLarge,
]);
export type CatalogLoadReason = typeof CatalogLoadReason.Type;

/**
 * A selected catalog source had no usable document.
 *
 * **When to use**
 *
 * Handle it wherever catalog sources are loaded; `message` already names the
 * source URL, and `reason` says what went wrong.
 */
export class CatalogLoadFailure extends Schema.TaggedError<CatalogLoadFailure>()(
  "CatalogLoadFailure",
  {
    reason: CatalogLoadReason,
    sourceUrl: Schema.String,
    message: Schema.String,
    /** Selected source name, when the failure came from `loadSources`. */
    sourceName: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect()),
  },
) {}

/**
 * A catalog loaded, but from a stale cache or without being cached.
 *
 * **When to use**
 *
 * Show it next to the result so the user knows the catalog may be outdated.
 */
export const CatalogLoadWarning = Schema.Struct({
  kind: Schema.Literals(["stale", "persistence"]),
  sourceUrl: Schema.String,
  lastValidatedAt: Schema.Number,
  message: Schema.String,
});
export type CatalogLoadWarning = typeof CatalogLoadWarning.Type;

/**
 * One selected source as it was loaded for this operation.
 *
 * **When to use**
 *
 * Report which catalogs an operation used, or persist and compare a selection.
 */
export const LoadedCatalogSource = Schema.Struct({
  name: Schema.String,
  sourceUrl: Schema.String,
  /** Sources this document declares it depends on, such as `official`. */
  requires: Schema.Array(Schema.Literal("official")),
  digest: Schema.String,
  freshness: Schema.Literals(["current", "cached"]),
  warning: Schema.optional(CatalogLoadWarning),
});
export type LoadedCatalogSource = typeof LoadedCatalogSource.Type;

const describeSource = (source: LoadedCatalogSource) =>
  `${source.name} (${source.sourceUrl}, ${
    source.warning?.kind === "stale"
      ? `cached, last validated at ${source.warning.lastValidatedAt} ms since epoch`
      : source.freshness
  })`;

/**
 * Every selected source loaded, but their definitions do not form one catalog.
 *
 * **When to use**
 *
 * Handle it next to `CatalogLoadFailure` when loading several sources.
 *
 * **Gotchas**
 *
 * When any source came from cache, the message suggests retrying once the
 * sources are reachable, because they may compose after a refresh.
 */
export class CatalogCompositionFailure extends Schema.TaggedError<CatalogCompositionFailure>()(
  "CatalogCompositionFailure",
  {
    issues: Schema.Array(CatalogIssue),
    sources: Schema.Array(LoadedCatalogSource),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    const refreshHint = this.sources.some(
      (source) => source.freshness === "cached",
    )
      ? " Retry when the catalog sources are reachable so they can be refreshed together."
      : "";

    return `Selected catalogs do not compose: ${this.issues
      .map((issue) => issue.message)
      .join(
        "; ",
      )}. Sources: ${this.sources.map(describeSource).join(", ")}.${refreshHint}`;
  }
}
