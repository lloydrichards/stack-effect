import { Array as Arr, Order, Schema } from "effect";
import { Contribution, ModuleId, TargetIdentity, TargetKey } from "./Catalog";
import { Selection } from "./Selection";
import { StackConfig } from "./StackConfig";

/**
 * The portable request accepted by planning entry points.
 *
 * A persisted project configuration may supply `config`, so callers can omit
 * it when their entry point has a configuration lookup step.
 */
export const PlanRequest = Schema.Struct({
  selection: Selection,
  config: Schema.optional(StackConfig),
});

export type PlanRequest = typeof PlanRequest.Type;

/**
 * A path relative to the repository root, such as `packages/domain/package.json`.
 * Absolute paths, such as a Plan's baseline root, stay plain strings.
 */
export const RepositoryPath = Schema.String.pipe(
  Schema.brand("RepositoryPath"),
);

export type RepositoryPath = typeof RepositoryPath.Type;

/**
 * Orders repository paths segment by segment, so a directory's files stay
 * together instead of interleaving with names that share its prefix.
 */
export const RepositoryPathOrder = Order.mapInput(
  Order.Array(Order.String),
  (path: string) => path.split("/"),
);

/** Orders values by their repository `path`. */
export const byPath = Order.mapInput(
  RepositoryPathOrder,
  (input: { path: string }) => input.path,
);

/** The repository root itself, as a repository path. */
export const repositoryRootPath = RepositoryPath.make(".");

const RepoSnapshotPath = Schema.TaggedUnion({
  missing: {
    path: RepositoryPath,
  },
  directory: {
    path: RepositoryPath,
  },
  file: {
    path: RepositoryPath,
    contents: Schema.String,
  },
});

export type RepoSnapshotPath = typeof RepoSnapshotPath.Type;

const RepoSnapshot = Schema.Struct({
  paths: Schema.Array(RepoSnapshotPath),
});

export type RepoSnapshot = typeof RepoSnapshot.Type;

/** The repository state against which a Plan was computed. */
const PlanBaselinePath = Schema.TaggedUnion({
  missing: { path: RepositoryPath },
  directory: { path: RepositoryPath },
  file: { path: RepositoryPath, sha256: Schema.String },
});

export type PlanBaselinePath = typeof PlanBaselinePath.Type;

const PackageOwner = Schema.Struct({
  path: RepositoryPath,
  name: Schema.NonEmptyString,
});

export type PackageOwner = typeof PackageOwner.Type;

const PlanBaseline = Schema.Struct({
  root: Schema.String,
  paths: Schema.Array(PlanBaselinePath),
  /** Discovered package ownership, retained for stale-Plan verification. */
  packageOwners: Schema.optional(Schema.Array(PackageOwner)),
});

export type PlanBaseline = typeof PlanBaseline.Type;

export class PlanFailure extends Schema.TaggedError<PlanFailure>()(
  "PlanFailure",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

const JsonPkgExportsOp = Schema.TaggedStruct("json-pkg-exports", {
  fileType: Schema.tag("json"),
  entries: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      value: Schema.String,
    }),
  ),
});

const JsonPkgDepsOp = Schema.TaggedStruct("json-pkg-deps", {
  fileType: Schema.tag("json"),
  section: Schema.Literals(["dependencies", "devDependencies"]),
  entries: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      value: Schema.String,
    }),
  ),
});

const JsonPkgScriptsOp = Schema.TaggedStruct("json-pkg-scripts", {
  fileType: Schema.tag("json"),
  entries: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      value: Schema.String,
    }),
  ),
});

/**
 * TypeScript Operations - for AST manipulation via ts-morph
 */
const TsAddImportOp = Schema.TaggedStruct("ts-add-import", {
  fileType: Schema.tag("typescript"),
  moduleSpecifier: Schema.String,
  namedImports: Schema.optional(Schema.Array(Schema.String)),
  defaultImport: Schema.optional(Schema.String),
  namespaceImport: Schema.optional(Schema.String),
  typeOnly: Schema.optional(Schema.Boolean),
});

export type TsAddImportOp = typeof TsAddImportOp.Type;

const TsAppendCallArgOp = Schema.TaggedStruct("ts-append-call-arg", {
  fileType: Schema.tag("typescript"),
  targetVariable: Schema.String,
  functionName: Schema.String,
  argument: Schema.String,
});

export type TsAppendCallArgOp = typeof TsAppendCallArgOp.Type;

const TsObjectFieldOp = Schema.TaggedStruct("ts-object-field", {
  fileType: Schema.tag("typescript"),
  targetVariable: Schema.String,
  functionName: Schema.String,
  field: Schema.String,
  value: Schema.String,
});

export type TsObjectFieldOp = typeof TsObjectFieldOp.Type;

const TsJsxSlotOp = Schema.TaggedStruct("ts-jsx-slot", {
  fileType: Schema.tag("typescript"),
  slotId: Schema.String,
  content: Schema.String,
});

export type TsJsxSlotOp = typeof TsJsxSlotOp.Type;

const JsonWorkspaceMembersOp = Schema.TaggedStruct("json-workspace-members", {
  fileType: Schema.tag("json"),
  field: Schema.Literals(["workspaces", "workspace"]),
  members: Schema.Array(Schema.String),
});

const JsonCompositionOperation = Schema.Union([
  JsonWorkspaceMembersOp,
  JsonPkgExportsOp,
  JsonPkgDepsOp,
  JsonPkgScriptsOp,
]);

const TypeScriptCompositionOperation = Schema.Union([
  TsAddImportOp,
  TsAppendCallArgOp,
  TsObjectFieldOp,
  TsJsxSlotOp,
]);

export type JsonCompositionOperation = typeof JsonCompositionOperation.Type;

export type TypeScriptCompositionOperation =
  typeof TypeScriptCompositionOperation.Type;

export const CompositionOperation = Schema.Union([
  JsonCompositionOperation,
  TypeScriptCompositionOperation,
]);

export type CompositionOperation = typeof CompositionOperation.Type;

const PlanEntryClassification = Schema.Literals([
  "create",
  "modify",
  "unchanged",
  "conflict",
]);

export type PlanEntryClassification = typeof PlanEntryClassification.Type;

export const PlanOutcome = Schema.TaggedUnion({
  complete: {
    path: RepositoryPath,
    classification: PlanEntryClassification,
    contents: Schema.String,
  },
  composed: {
    path: RepositoryPath,
    classification: PlanEntryClassification,
    seedContents: Schema.optional(Schema.String),
    operations: Schema.Array(CompositionOperation),
  },
});

export type PlanOutcome = typeof PlanOutcome.Type;

export const PlanConflict = Schema.TaggedUnion({
  exports: {
    path: RepositoryPath,
    name: Schema.String,
  },
  dependencies: {
    path: RepositoryPath,
    section: Schema.String,
    name: Schema.String,
  },
  scripts: {
    path: RepositoryPath,
    name: Schema.String,
  },
  tsconfig: {
    path: RepositoryPath,
  },
  completeFile: {
    path: RepositoryPath,
  },
  compositionTargetNotFound: {
    path: RepositoryPath,
    targetVariable: Schema.String,
    functionName: Schema.String,
  },
  jsxSlotTargetNotFound: {
    path: RepositoryPath,
    slotId: Schema.String,
  },
});

export type PlanConflict = typeof PlanConflict.Type;

const planConflictKey = (conflict: PlanConflict): string =>
  PlanConflict.match(conflict, {
    exports: (c) => JSON.stringify([c._tag, c.path, c.name]),
    dependencies: (c) => JSON.stringify([c._tag, c.path, c.section, c.name]),
    scripts: (c) => JSON.stringify([c._tag, c.path, c.name]),
    tsconfig: (c) => JSON.stringify([c._tag, c.path]),
    completeFile: (c) => JSON.stringify([c._tag, c.path]),
    compositionTargetNotFound: (c) =>
      JSON.stringify([c._tag, c.path, c.targetVariable, c.functionName]),
    jsxSlotTargetNotFound: (c) => JSON.stringify([c._tag, c.path, c.slotId]),
  });

const duplicates = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  Arr.map(
    Arr.filter(
      Object.entries(Arr.groupBy(values, (value) => value)),
      ([, groupedValues]) => groupedValues.length > 1,
    ),
    ([value]) => value,
  );

const PlanFields = Schema.Struct({
  baseline: PlanBaseline,
  outcomes: Schema.Array(PlanOutcome),
  conflicts: Schema.Array(PlanConflict),
}).check(
  Schema.makeFilter(({ baseline, conflicts, outcomes }) => {
    const baselinePaths = baseline.paths.map((entry) => entry.path);
    const outcomePaths = outcomes.map((outcome) => outcome.path);
    const conflictKeys = conflicts.map(planConflictKey);
    const conflictedOutcomePaths = new Set(
      outcomes
        .filter((outcome) => outcome.classification === "conflict")
        .map((outcome) => outcome.path),
    );
    const conflictPaths = new Set(conflicts.map((conflict) => conflict.path));

    return [
      ...duplicates(baselinePaths).map(
        (path) => `Plan baseline paths must be unique; duplicate path: ${path}`,
      ),
      ...duplicates(outcomePaths).map(
        (path) => `Plan outcome paths must be unique; duplicate path: ${path}`,
      ),
      ...duplicates(conflictKeys).map(
        (key) =>
          `Plan conflict diagnostics must be unique; duplicate identity: ${key}`,
      ),
      ...[...conflictPaths]
        .filter((path) => !conflictedOutcomePaths.has(path))
        .map(
          (path) =>
            `Plan conflict diagnostic path must reference a conflicted outcome: ${path}`,
        ),
      ...[...conflictedOutcomePaths]
        .filter((path) => !conflictPaths.has(path))
        .map(
          (path) =>
            `Plan conflicted outcome must have at least one conflict diagnostic: ${path}`,
        ),
    ];
  }),
);

/**
 * The repo-aware outcome of applying a Blueprint to the current filesystem.
 *
 * A Plan pairs each contributed file path with a classification (create,
 * modify, unchanged, or conflict) and its resolved contents or composition
 * operations. It also records the inspected repository state and surfaces
 * detected conflicts that require user decisions before execution.
 *
 * The Plan is policy-free: it records what *would* happen but does not make
 * apply decisions. Those belong to the Apply stage via ApplyDecision entries.
 *
 * @category Plan
 * @since 1.0.0
 */
export class Plan extends Schema.Class<Plan>("Plan")(PlanFields) {
  // fallow-ignore-next-line unused-class-member -- called by projectPlan in PlanService
  toSorted(): Plan {
    return new Plan({
      baseline: {
        root: this.baseline.root,
        packageOwners:
          this.baseline.packageOwners === undefined
            ? undefined
            : [...this.baseline.packageOwners].sort(byPath),
        paths: [...this.baseline.paths].sort(byPath),
      },
      outcomes: [...this.outcomes].sort(byPath),
      conflicts: [...this.conflicts].sort(
        Order.mapInput(Order.String, planConflictKey),
      ),
    });
  }
}

export const TargetContribution = Schema.Struct({
  targetKey: TargetKey,
  contributions: Schema.Array(Contribution),
});

export const ModuleContribution = Schema.Struct({
  targetKey: TargetKey,
  moduleId: ModuleId,
  contributions: Schema.Array(Contribution),
});

const NormalizedContributions = Schema.Struct({
  targets: Schema.Array(TargetContribution),
  modules: Schema.Array(ModuleContribution),
});

export type NormalizedContributions = typeof NormalizedContributions.Type;

export class ContributionTokenContext extends Schema.Class<ContributionTokenContext>(
  "ContributionTokenContext",
)({
  targetKey: TargetKey,
  identity: TargetIdentity,
  config: StackConfig,
  moduleIds: Schema.optional(Schema.Array(Schema.String)),
  scaffoldRecipe: Schema.optional(Schema.String),
  projectTargets: Schema.optional(
    Schema.Array(
      Schema.Struct({ identity: TargetIdentity, description: Schema.String }),
    ),
  ),
}) {
  /**
   * Resolve template tokens and conditionals in a string.
   *
   * ## Simple Tokens
   * - `{{projectName}}` - Project name from config
   * - `{{runtime}}` - "bun", "deno", or "node"
   * - `{{packageManager}}` - "bun", "deno", "npm", or "pnpm"
   * - `{{packageManagerSpec}}` - Full version spec (e.g., "bun@1.4.2")
   * - `{{typescript}}` - TypeScript major version ("6" or "7"; defaults to "6")
   * - `{{workspaceDependency}}` - Package-manager-compatible local workspace range
   * - `{{lint}}` - Lint tool ("biome", "oxlint", or "")
   * - `{{format}}` - Format tool ("biome", "dprint", "oxfmt", or "")
   * - `{{test}}` - Test framework ("vitest" or "")
   * - `{{monorepo}}` - Monorepo tool (for example, "turbo", "vite-plus", or "nx")
   * - `{{runCommand}}` - Package script runner for the selected runtime
   * - `{{scaffoldRecipe}}` - Command to recreate the initial resolved scaffold
   * - `{{workspaceTargets}}` - Markdown table of the initial project targets
   * - `{{projectRoot}}` - Relative path from this target to the project root
   * - `{{targetKind}}`, `{{targetName}}`, `{{targetPath}}`, `{{targetDir}}`, `{{packageName}}`
   *
   * ## Conditionals
   * - `{{#if field}}...{{/if}}` - Include content if field is truthy (non-empty)
   * - `{{#if field=value}}...{{/if}}` - Include content if field equals value
   * - `{{#if module=module-id}}...{{/if}}` - Include content when the target has that module
   * - `{{#if noModule=module-id}}...{{/if}}` - Include content when the target lacks that module
   * - `hasApps` - Truthy when the initial project contains application targets
   * - `effectOxlint` - Truthy for TypeScript 7 with Oxlint
   * - `standaloneOxlint` - Truthy for Oxlint outside Vite+
   * - `standaloneEffectOxlint` - Truthy for Effect Oxlint outside Vite+
   * - `noMonorepo` - Truthy when no monorepo tool is selected
   * - `typescript7Diagnostics` - Truthy for TypeScript 7 without Effect Oxlint
   *
   * Unknown fields in conditionals silently evaluate as falsy.
   */
  resolve(template: string): string {
    const resolvedTargetName =
      this.identity.name.trim().length > 0
        ? this.identity.name
        : this.identity.kind;

    const targetPath = this.identity.toPath();

    // NOTE: Workspace targets omit "./" so token output matches contribution paths.
    const resolveTargetToken = (t: string, token: string) =>
      targetPath === "."
        ? t.replaceAll(`${token}/`, "").replaceAll(token, "")
        : t.replaceAll(token, targetPath);

    const getConfigValue = (field: string): string => {
      switch (field) {
        case "hasApps":
          return this.projectTargets?.some(
            ({ identity }) =>
              identity.kind !== "workspace" && identity.kind !== "package",
          )
            ? "true"
            : "";
        case "runtime":
          return this.config.runtimeName;
        case "packageManager":
          return this.config.packageManagerName;
        case "typescript":
          return this.config.typescriptVersion;
        case "lint":
          return this.config.lint ?? "";
        case "format":
          return this.config.format ?? "";
        case "test":
          return this.config.test ?? "";
        case "monorepo":
          return this.config.monorepo ?? "";
        case "noMonorepo":
          return this.config.monorepo === undefined ? "true" : "";
        case "effectOxlint":
          return this.config.typescriptVersion === "7" &&
            this.config.lint === "oxlint"
            ? "true"
            : "";
        case "standaloneOxlint":
          return this.config.lint === "oxlint" &&
            this.config.monorepo !== "vite-plus"
            ? "true"
            : "";
        case "standaloneEffectOxlint":
          return this.config.typescriptVersion === "7" &&
            this.config.lint === "oxlint" &&
            this.config.monorepo !== "vite-plus"
            ? "true"
            : "";
        case "typescript7Diagnostics":
          return this.config.typescriptVersion === "7" &&
            this.config.lint !== "oxlint"
            ? "true"
            : "";
        default:
          return "";
      }
    };

    const resolveConditionals = (t: string): string => {
      const conditionalRegex =
        /\{\{#if\s+(\w+)(?:=([\w-]+))?\}\}([\s\S]*?)\{\{\/if\}\}/g;
      return t.replace(conditionalRegex, (_, field, value, content) => {
        if (
          value !== undefined &&
          (field === "module" || field === "noModule")
        ) {
          const selected = this.moduleIds?.includes(value) ?? false;
          return (field === "module" ? selected : !selected) ? content : "";
        }
        const configValue = getConfigValue(field);
        if (value !== undefined) {
          return configValue === value ? content : "";
        }
        return configValue.length > 0 ? content : "";
      });
    };

    const withConditionals = resolveConditionals(template);
    const projectTargets =
      this.projectTargets?.filter(
        ({ identity }) => identity.kind !== "workspace",
      ) ?? [];
    const workspaceTargets =
      projectTargets.length === 0
        ? "This workspace has no application yet. Add targets with `stack-effect add`."
        : [
            "| Workspace | Responsibility |",
            "| --- | --- |",
            ...projectTargets.map(
              ({ identity, description }) =>
                `| [${identity.toPath()}](${identity.toPath()}) | ${description.replaceAll("|", "\\|").replaceAll("\n", " ")} |`,
            ),
          ].join("\n");
    const projectRoot =
      targetPath === "."
        ? "."
        : targetPath
            .split("/")
            .map(() => "..")
            .join("/");

    return resolveTargetToken(
      resolveTargetToken(
        withConditionals
          .replaceAll("{{targetKind}}", this.identity.kind)
          .replaceAll("{{targetName}}", resolvedTargetName)
          .replaceAll("{{packageName}}", this.identity.toPackageName())
          .replaceAll("{{runtime}}", this.config.runtimeName)
          .replaceAll("{{packageManager}}", this.config.packageManagerName)
          .replaceAll("{{packageManagerSpec}}", this.config.packageManagerSpec)
          .replaceAll("{{typescript}}", this.config.typescriptVersion)
          .replaceAll(
            "{{workspaceDependency}}",
            this.config.workspaceDependency,
          )
          .replaceAll("{{projectName}}", this.config.name)
          .replaceAll("{{lint}}", this.config.lint ?? "")
          .replaceAll("{{format}}", this.config.format ?? "")
          .replaceAll("{{test}}", this.config.test ?? "")
          .replaceAll("{{monorepo}}", this.config.monorepo ?? ""),
        "{{targetDir}}",
      ),
      "{{targetPath}}",
    )
      .replaceAll(
        "{{runCommand}}",
        this.config.runtimeName === "deno"
          ? "deno task"
          : `${this.config.packageManagerName} run`,
      )
      .replaceAll("{{projectRoot}}", projectRoot)
      .replaceAll("{{workspaceTargets}}", () => workspaceTargets)
      .replaceAll("{{scaffoldRecipe}}", () => this.scaffoldRecipe ?? "");
  }
}
