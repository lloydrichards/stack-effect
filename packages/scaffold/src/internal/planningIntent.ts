import { Contribution } from "@repo/domain/Catalog";
import { PlanFailure, RepositoryPath } from "@repo/domain/Plan";
import type { NormalizedContributions } from "@repo/domain/Scaffold";
import { Array as Arr, Effect, Option, Schema } from "effect";
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
});

type PlanningIntentPackageJsonEntry =
  typeof PlanningIntentPackageJsonEntry.Type;

const PlanningIntentBarrelExportEntry = Schema.TaggedStruct("barrelExport", {
  path: RepositoryPath,
  exportPath: Schema.String,
});

type PlanningIntentBarrelExportEntry =
  typeof PlanningIntentBarrelExportEntry.Type;

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
  PlanningIntentBarrelExportEntry,
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
        }),
      ],
      "barrel-export": (c): ReadonlyArray<PlanningIntentEntry> => [
        PlanningIntentEntry.cases.barrelExport.make({
          path: RepositoryPath.make(c.barrelPath),
          exportPath: c.exportPath,
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
  readonly authoritative: ReadonlyArray<PlanningIntentAuthoritativeEntry>;
  readonly packageJson: ReadonlyArray<PlanningIntentPackageJsonEntry>;
  readonly barrel: ReadonlyArray<PlanningIntentBarrelExportEntry>;
  readonly tsCallArg: ReadonlyArray<PlanningIntentTsCallArgEntry>;
  readonly tsObjectField: ReadonlyArray<PlanningIntentTsObjectFieldEntry>;
  readonly jsxSlot: ReadonlyArray<PlanningIntentJsxSlotEntry>;
};

const groupPlanningIntentEntries = (
  entries: ReadonlyArray<PlanningIntentEntry>,
): PlanningIntentEntryGroups => ({
  authoritative: entries.filter(PlanningIntentEntry.guards.authoritative),
  packageJson: entries.filter(PlanningIntentEntry.guards.packageJsonEntry),
  barrel: entries.filter(PlanningIntentEntry.guards.barrelExport),
  tsCallArg: entries.filter(PlanningIntentEntry.guards.tsCallArg),
  tsObjectField: entries.filter(PlanningIntentEntry.guards.tsObjectField),
  jsxSlot: entries.filter(PlanningIntentEntry.guards.jsxSlot),
});

type PlanningIntentFamily =
  | "authoritative"
  | "packageJson"
  | "barrel"
  | "tsCallArg"
  | "jsxSlot";

type CompositePlanningIntentFamily =
  | "authoritativePackageJson"
  | "authoritativeTsCallArg"
  | "authoritativeBarrel"
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
  { pair: ["authoritative", "barrel"], result: "authoritativeBarrel" },
  { pair: ["authoritative", "jsxSlot"], result: "authoritativeJsxSlot" },
];

const toPlanningIntentFamily = PlanningIntentEntry.match({
  authoritative: () => "authoritative" as const,
  packageJsonEntry: () => "packageJson" as const,
  barrelExport: () => "barrel" as const,
  tsCallArg: () => "tsCallArg" as const,
  tsObjectField: () => "tsCallArg" as const,
  jsxSlot: () => "jsxSlot" as const,
}) satisfies (entry: PlanningIntentEntry) => PlanningIntentFamily;

const derivePlanningIntentFamily = Effect.fnUntraced(function* (
  entries: ReadonlyArray<PlanningIntentEntry>,
  path: string,
): Effect.fn.Return<
  PlanningIntentFamily | CompositePlanningIntentFamily,
  PlanFailure
> {
  const families = new Set(entries.map(toPlanningIntentFamily));
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

  return yield* new PlanFailure({
    message: `Conflicting planning intents for ${path}.`,
  });
});

const requireSingleValue = Effect.fnUntraced(function* <Value>(
  values: ReadonlyArray<Value>,
  errorMessage: string,
) {
  const first = Arr.head(values);
  if (Option.isNone(first) || !values.every((value) => value === first.value)) {
    return yield* new PlanFailure({ message: errorMessage });
  }
  return first.value;
});

// Keeps the first entry for each key and fails when entries with one key disagree on their value.
const collectUniqueEntries = Effect.fnUntraced(function* <Entry, Result>({
  entries,
  keyOf,
  valueOf,
  toResult,
  errorMessage,
}: {
  entries: ReadonlyArray<Entry>;
  keyOf: (entry: Entry) => string;
  valueOf: (entry: Entry) => string;
  toResult: (entry: Entry) => Result;
  errorMessage: string;
}) {
  const firstByKey = new Map<string, Entry>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const first = firstByKey.get(key);
    if (first === undefined) {
      firstByKey.set(key, entry);
      continue;
    }
    if (valueOf(entry) !== valueOf(first)) {
      return yield* new PlanFailure({ message: errorMessage });
    }
  }
  return [...firstByKey.values()].map(toResult);
});

const derivePlanningIntentPath = Effect.fnUntraced(function* (
  path: RepositoryPath,
  entries: ReadonlyArray<PlanningIntentEntry>,
): Effect.fn.Return<PlanningIntentPath, PlanFailure> {
  const family = yield* derivePlanningIntentFamily(entries, path);
  const groups = groupPlanningIntentEntries(entries);

  const resolveContents = () =>
    requireSingleValue(
      groups.authoritative.map((entry) => entry.contents),
      `Conflicting authoritative file outcomes for ${path}.`,
    );

  const packageJson = Effect.fnUntraced(function* (seed: string | undefined) {
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

    const exports = yield* collectUniqueEntries({
      entries: exportEntries,
      keyOf: (entry) => entry.name,
      valueOf: (entry) => entry.value,
      toResult: (entry) => ({ name: entry.name, value: entry.value }),
      errorMessage: `Conflicting package.json export outcomes for ${path}.`,
    });
    const dependencies = yield* collectUniqueEntries({
      entries: depEntries,
      keyOf: (entry) => `${entry.field}:${entry.name}`,
      valueOf: (entry) => entry.value,
      toResult: (entry) => ({
        section: entry.field,
        name: entry.name,
        value: entry.value,
      }),
      errorMessage: `Conflicting package.json dependency outcomes for ${path}.`,
    });
    const scripts = yield* collectUniqueEntries({
      entries: scriptEntries,
      keyOf: (entry) => entry.name,
      valueOf: (entry) => entry.value,
      toResult: (entry) => ({ name: entry.name, value: entry.value }),
      errorMessage: `Conflicting package.json script outcomes for ${path}.`,
    });

    return PlanningIntentPath.cases.packageJson.make({
      path,
      seed,
      exports,
      dependencies,
      scripts,
    });
  });

  const barrel = Effect.fnUntraced(function* (seed: string | undefined) {
    const exportPaths = yield* collectUniqueEntries({
      entries: groups.barrel,
      keyOf: (entry) => entry.exportPath,
      valueOf: (entry) => entry.exportPath,
      toResult: (entry) => entry.exportPath,
      errorMessage: `Conflicting barrel export outcomes for ${path}.`,
    });
    return PlanningIntentPath.cases.barrel.make({ path, seed, exportPaths });
  });

  const tsComposition = (seed: string | undefined) =>
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

  const jsxSlot = (seed: string | undefined) =>
    PlanningIntentPath.cases.jsxSlot.make({
      path,
      seed,
      jsxSlots: groups.jsxSlot.map((entry) => ({
        slotId: entry.slotId,
        content: entry.content,
        import: entry.import,
      })),
    });

  switch (family) {
    case "authoritative": {
      const contents = yield* resolveContents();
      return groups.authoritative.some((entry) => entry.conflictOnModify)
        ? PlanningIntentPath.cases.conflictOnModify.make({ path, contents })
        : PlanningIntentPath.cases.authoritative.make({ path, contents });
    }
    case "packageJson":
      return yield* packageJson(undefined);
    case "barrel":
      return yield* barrel(undefined);
    case "tsCallArg":
      return tsComposition(undefined);
    case "jsxSlot":
      return jsxSlot(undefined);
    case "authoritativePackageJson":
      return yield* packageJson(yield* resolveContents());
    case "authoritativeTsCallArg":
      return tsComposition(yield* resolveContents());
    case "authoritativeBarrel":
      return yield* barrel(yield* resolveContents());
    case "authoritativeJsxSlot":
      return jsxSlot(yield* resolveContents());
  }
});

// Groups normalized contributions by path into one planning intent per path.
/** @internal */
export const compile = Effect.fnUntraced(function* (
  normalizedContributions: NormalizedContributions,
): Effect.fn.Return<ReadonlyArray<PlanningIntentPath>, PlanFailure> {
  const entries = [
    ...normalizedContributions.targets,
    ...normalizedContributions.modules,
  ].flatMap((entry) => toPlanningIntentEntries(entry.contributions));

  const planningPaths: Array<PlanningIntentPath> = [];
  for (const [path, pathEntries] of Map.groupBy(
    entries,
    (entry) => entry.path,
  )) {
    planningPaths.push(yield* derivePlanningIntentPath(path, pathEntries));
  }
  return planningPaths;
});
