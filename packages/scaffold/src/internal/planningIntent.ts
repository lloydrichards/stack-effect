import { Contribution } from "@repo/domain/Catalog";
import {
  PlanError,
  RepositoryPath,
  type NormalizedContributions,
} from "@repo/domain/Plan";
import { Array as Arr, Effect, Equivalence, Option, Schema } from "effect";
import { PlanningIntentImport, PlanningIntentPath } from "./planAssessment";

const PlanningIntentAuthoritativeEntry = Schema.TaggedStruct("authoritative", {
  path: RepositoryPath,
  contents: Schema.String,
  conflictOnModify: Schema.Boolean,
});

type PlanningIntentAuthoritativeEntry =
  typeof PlanningIntentAuthoritativeEntry.Type;

const PlanningIntentPackageJsonEntry = Schema.TaggedStruct("packageJsonEntry", {
  path: RepositoryPath,
  field: Schema.Literals([
    "exports",
    "dependencies",
    "devDependencies",
    "scripts",
  ]),
  name: Schema.String,
  value: Schema.String,
  compiledValue: Schema.optional(Schema.String),
});

type PlanningIntentPackageJsonEntry =
  typeof PlanningIntentPackageJsonEntry.Type;

const PlanningIntentTsCallArgEntry = Schema.TaggedStruct("tsCallArg", {
  path: RepositoryPath,
  targetVariable: Schema.String,
  functionName: Schema.String,
  argument: Schema.String,
  import: PlanningIntentImport,
});

type PlanningIntentTsCallArgEntry = typeof PlanningIntentTsCallArgEntry.Type;

const PlanningIntentTsObjectFieldEntry = Schema.TaggedStruct("tsObjectField", {
  path: RepositoryPath,
  targetVariable: Schema.String,
  functionName: Schema.String,
  field: Schema.String,
  value: Schema.String,
  import: Schema.Union([PlanningIntentImport, Schema.Undefined]),
});

type PlanningIntentTsObjectFieldEntry =
  typeof PlanningIntentTsObjectFieldEntry.Type;

const PlanningIntentJsxSlotEntry = Schema.TaggedStruct("jsxSlot", {
  path: RepositoryPath,
  slotId: Schema.String,
  content: Schema.String,
  import: Schema.Union([PlanningIntentImport, Schema.Undefined]),
});

type PlanningIntentJsxSlotEntry = typeof PlanningIntentJsxSlotEntry.Type;

const PlanningIntentEntry = Schema.Union([
  PlanningIntentAuthoritativeEntry,
  PlanningIntentPackageJsonEntry,
  PlanningIntentTsCallArgEntry,
  PlanningIntentTsObjectFieldEntry,
  PlanningIntentJsxSlotEntry,
]).pipe(Schema.toTaggedUnion("_tag"));

type PlanningIntentEntry = typeof PlanningIntentEntry.Type;

const toPlanningIntentEntries = (
  contributions: ReadonlyArray<Contribution>,
): ReadonlyArray<PlanningIntentEntry> =>
  contributions.flatMap(
    Contribution.match({
      file: (c): ReadonlyArray<PlanningIntentEntry> => [
        PlanningIntentEntry.cases.authoritative.make({
          path: RepositoryPath.make(c.path),
          contents: c.contents,
          conflictOnModify: c.conflictOnModify ?? false,
        }),
      ],
      "pkg-json-entry": (c): ReadonlyArray<PlanningIntentEntry> => [
        PlanningIntentEntry.cases.packageJsonEntry.make({
          path: RepositoryPath.make(c.path),
          field: c.field,
          name: c.name,
          value: c.value,
          compiledValue: c.compiledValue,
        }),
      ],
      "ts-call-arg": (c): ReadonlyArray<PlanningIntentEntry> => [
        PlanningIntentEntry.cases.tsCallArg.make({
          path: RepositoryPath.make(c.path),
          targetVariable: c.targetVariable,
          functionName: c.functionName,
          argument: c.argument,
          import: {
            moduleSpecifier: c.import.moduleSpecifier,
            namedImports: c.import.namedImports,
            defaultImport: c.import.defaultImport,
            namespaceImport: c.import.namespaceImport,
          },
        }),
      ],
      "ts-object-field": (c): ReadonlyArray<PlanningIntentEntry> => [
        PlanningIntentEntry.cases.tsObjectField.make({
          path: RepositoryPath.make(c.path),
          targetVariable: c.targetVariable,
          functionName: c.functionName,
          field: c.field,
          value: c.value,
          import: c.import
            ? {
                moduleSpecifier: c.import.moduleSpecifier,
                namedImports: c.import.namedImports,
                defaultImport: c.import.defaultImport,
                namespaceImport: c.import.namespaceImport,
              }
            : undefined,
        }),
      ],
      "jsx-slot": (c): ReadonlyArray<PlanningIntentEntry> => [
        PlanningIntentEntry.cases.jsxSlot.make({
          path: RepositoryPath.make(c.path),
          slotId: c.slotId,
          content: c.content,
          import: c.import
            ? {
                moduleSpecifier: c.import.moduleSpecifier,
                namedImports: c.import.namedImports,
                defaultImport: c.import.defaultImport,
                namespaceImport: c.import.namespaceImport,
              }
            : undefined,
        }),
      ],
    }),
  );

type PlanningIntentEntryGroups = {
  authoritative: ReadonlyArray<PlanningIntentAuthoritativeEntry>;
  packageJson: ReadonlyArray<PlanningIntentPackageJsonEntry>;
  tsCallArg: ReadonlyArray<PlanningIntentTsCallArgEntry>;
  tsObjectField: ReadonlyArray<PlanningIntentTsObjectFieldEntry>;
  jsxSlot: ReadonlyArray<PlanningIntentJsxSlotEntry>;
};

type PathEntries = {
  path: RepositoryPath;
  groups: PlanningIntentEntryGroups;
};

const groupPlanningIntentEntries = (
  entries: ReadonlyArray<PlanningIntentEntry>,
): PlanningIntentEntryGroups => ({
  authoritative: entries.filter(PlanningIntentEntry.guards.authoritative),
  packageJson: entries.filter(PlanningIntentEntry.guards.packageJsonEntry),
  tsCallArg: entries.filter(PlanningIntentEntry.guards.tsCallArg),
  tsObjectField: entries.filter(PlanningIntentEntry.guards.tsObjectField),
  jsxSlot: entries.filter(PlanningIntentEntry.guards.jsxSlot),
});

type PlanningIntentFamily =
  | "authoritative"
  | "packageJson"
  | "tsCallArg"
  | "jsxSlot";

type CompositePlanningIntentFamily =
  | "authoritativePackageJson"
  | "authoritativeTsCallArg"
  | "authoritativeJsxSlot";

const COMPOSITE_FAMILIES: ReadonlyArray<{
  pair: [PlanningIntentFamily, PlanningIntentFamily];
  result: CompositePlanningIntentFamily;
}> = [
  {
    pair: ["authoritative", "packageJson"],
    result: "authoritativePackageJson",
  },
  { pair: ["authoritative", "tsCallArg"], result: "authoritativeTsCallArg" },
  { pair: ["authoritative", "jsxSlot"], result: "authoritativeJsxSlot" },
];

const FAMILY_OF_ENTRY = {
  authoritative: "authoritative",
  packageJsonEntry: "packageJson",
  tsCallArg: "tsCallArg",
  tsObjectField: "tsCallArg",
  jsxSlot: "jsxSlot",
} satisfies Record<PlanningIntentEntry["_tag"], PlanningIntentFamily>;

const derivePlanningIntentFamily = Effect.fnUntraced(function* (
  entries: ReadonlyArray<PlanningIntentEntry>,
  path: string,
): Effect.fn.Return<
  PlanningIntentFamily | CompositePlanningIntentFamily,
  PlanError
> {
  const families = new Set(entries.map((entry) => FAMILY_OF_ENTRY[entry._tag]));
  const [family] = families;

  if (families.size === 1 && family !== undefined) {
    return family;
  }

  if (families.size === 2) {
    const match = COMPOSITE_FAMILIES.find(
      ({ pair }) => families.has(pair[0]) && families.has(pair[1]),
    );
    if (match) {
      return match.result;
    }
  }

  return yield* new PlanError({
    message: `Conflicting planning intents for ${path}.`,
  });
});

const requireSingleValue = Effect.fnUntraced(function* <Value>(
  values: ReadonlyArray<Value>,
  errorMessage: string,
) {
  const first = Arr.head(values);
  if (Option.isNone(first) || !values.every((value) => value === first.value)) {
    return yield* new PlanError({ message: errorMessage });
  }
  return first.value;
});

const SamePackageJsonKey = Equivalence.make<PlanningIntentPackageJsonEntry>(
  (self, that) => self.field === that.field && self.name === that.name,
);

// Keeps the first entry for each key and fails when entries with one key disagree on their value.
const collectUniqueEntries = Effect.fnUntraced(function* <
  Entry extends PlanningIntentPackageJsonEntry,
>(entries: ReadonlyArray<Entry>, errorMessage: string) {
  const firsts = Arr.dedupeWith(entries, SamePackageJsonKey);
  const disagrees = entries.some((entry) =>
    firsts.some(
      (first) =>
        SamePackageJsonKey(first, entry) &&
        (first.value !== entry.value ||
          first.compiledValue !== entry.compiledValue),
    ),
  );
  if (disagrees) return yield* new PlanError({ message: errorMessage });
  return firsts;
});

const resolveContents = ({ path, groups }: PathEntries) =>
  requireSingleValue(
    groups.authoritative.map((entry) => entry.contents),
    `Conflicting authoritative file outcomes for ${path}.`,
  );

const packageJsonPath = Effect.fnUntraced(function* (
  { path, groups }: PathEntries,
  seed: string | undefined,
) {
  const exportEntries = groups.packageJson.filter(
    (e): e is PlanningIntentPackageJsonEntry & { field: "exports" } =>
      e.field === "exports",
  );
  const depEntries = groups.packageJson.filter(
    (
      e,
    ): e is PlanningIntentPackageJsonEntry & {
      field: "dependencies" | "devDependencies";
    } => e.field === "dependencies" || e.field === "devDependencies",
  );
  const scriptEntries = groups.packageJson.filter(
    (e): e is PlanningIntentPackageJsonEntry & { field: "scripts" } =>
      e.field === "scripts",
  );

  const exports = yield* collectUniqueEntries(
    exportEntries,
    `Conflicting package.json export outcomes for ${path}.`,
  );
  const dependencies = yield* collectUniqueEntries(
    depEntries,
    `Conflicting package.json dependency outcomes for ${path}.`,
  );
  const scripts = yield* collectUniqueEntries(
    scriptEntries,
    `Conflicting package.json script outcomes for ${path}.`,
  );

  return PlanningIntentPath.cases.packageJson.make({
    path,
    seed,
    exports: exports.map(({ name, value, compiledValue }) => ({
      name,
      value,
      compiledValue,
    })),
    dependencies: dependencies.map(({ field, name, value }) => ({
      section: field,
      name,
      value,
    })),
    scripts: scripts.map(({ name, value }) => ({ name, value })),
  });
});

const tsCompositionPath = (
  { path, groups }: PathEntries,
  seed: string | undefined,
) =>
  PlanningIntentPath.cases.tsComposition.make({
    path,
    seed,
    compositions: groups.tsCallArg.map((entry) => ({
      targetVariable: entry.targetVariable,
      functionName: entry.functionName,
      argument: entry.argument,
      import: entry.import,
    })),
    objectFields: groups.tsObjectField.map((entry) => ({
      targetVariable: entry.targetVariable,
      functionName: entry.functionName,
      field: entry.field,
      value: entry.value,
      import: entry.import,
    })),
  });

const jsxSlotPath = ({ path, groups }: PathEntries, seed: string | undefined) =>
  PlanningIntentPath.cases.jsxSlot.make({
    path,
    seed,
    jsxSlots: groups.jsxSlot.map((entry) => ({
      slotId: entry.slotId,
      content: entry.content,
      import: entry.import,
    })),
  });

const derivePlanningIntentPath = Effect.fnUntraced(function* (
  entries: Arr.NonEmptyReadonlyArray<PlanningIntentEntry>,
): Effect.fn.Return<PlanningIntentPath, PlanError> {
  const { path } = entries[0];
  const family = yield* derivePlanningIntentFamily(entries, path);
  const pathEntries = { path, groups: groupPlanningIntentEntries(entries) };

  switch (family) {
    case "authoritative": {
      const contents = yield* resolveContents(pathEntries);
      return pathEntries.groups.authoritative.some(
        (entry) => entry.conflictOnModify,
      )
        ? PlanningIntentPath.cases.conflictOnModify.make({ path, contents })
        : PlanningIntentPath.cases.authoritative.make({ path, contents });
    }
    case "packageJson":
      return yield* packageJsonPath(pathEntries, undefined);
    case "tsCallArg":
      return tsCompositionPath(pathEntries, undefined);
    case "jsxSlot":
      return jsxSlotPath(pathEntries, undefined);
    case "authoritativePackageJson":
      return yield* packageJsonPath(
        pathEntries,
        yield* resolveContents(pathEntries),
      );
    case "authoritativeTsCallArg":
      return tsCompositionPath(
        pathEntries,
        yield* resolveContents(pathEntries),
      );
    case "authoritativeJsxSlot":
      return jsxSlotPath(pathEntries, yield* resolveContents(pathEntries));
  }
});

/** @internal */
export const compile = Effect.fnUntraced(function* (
  normalizedContributions: NormalizedContributions,
): Effect.fn.Return<ReadonlyArray<PlanningIntentPath>, PlanError> {
  const entries = [
    ...normalizedContributions.targets,
    ...normalizedContributions.modules,
  ].flatMap((entry) => toPlanningIntentEntries(entry.contributions));

  return yield* Effect.forEach(
    Object.values(Arr.groupBy(entries, (entry) => entry.path)),
    derivePlanningIntentPath,
  );
});
