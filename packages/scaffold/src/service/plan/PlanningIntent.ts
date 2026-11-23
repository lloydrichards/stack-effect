import { Contribution } from "@repo/domain/Catalog";
import { PlanFailure, RepositoryPath } from "@repo/domain/Plan";
import type { NormalizedContributions } from "@repo/domain/Scaffold";
import {
  Array as Arr,
  Effect,
  Match,
  Option,
  pipe,
  Record,
  Schema,
} from "effect";
import { PlanningIntentImport, PlanningIntentPath } from "./PlanAssessment";

/** Groups normalized contributions by path into one planning intent per path. */
export const compile = (
  normalizedContributions: NormalizedContributions,
): Effect.Effect<ReadonlyArray<PlanningIntentPath>, PlanFailure> => {
  const entriesByPath = Arr.groupBy(
    Arr.flatMap(
      [
        ...Arr.map(
          normalizedContributions.targets,
          (entry) => entry.contributions,
        ),
        ...Arr.map(
          normalizedContributions.modules,
          (entry) => entry.contributions,
        ),
      ],
      toPlanningIntentEntries,
    ),
    (entry) => entry.path,
  );

  return Effect.all(
    Record.collect(entriesByPath, (_, entries) =>
      derivePlanningIntentPath({ path: entries[0].path, entries }),
    ),
  );
};

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
  Arr.flatMap(
    contributions,
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

const derivePlanningIntentPath = ({
  path,
  entries,
}: {
  path: RepositoryPath;
  entries: ReadonlyArray<PlanningIntentEntry>;
}): Effect.Effect<PlanningIntentPath, PlanFailure> =>
  Effect.gen(function* () {
    const family = yield* derivePlanningIntentFamily({ entries, path });
    const groups = groupPlanningIntentEntries(entries);

    const resolveContents = () =>
      requireSingleValue({
        values: Arr.map(groups.authoritative, (entry) => entry.contents),
        errorMessage: `Conflicting authoritative file outcomes for ${path}.`,
      });

    const packageJson = (seed: string | undefined) =>
      Effect.gen(function* () {
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

        const fields = yield* Effect.all({
          exports: collectUniqueEntries({
            entries: exportEntries,
            keyOf: (entry) => entry.name,
            valueOf: (entry) => entry.value,
            toResult: (entry) => ({ name: entry.name, value: entry.value }),
            errorMessage: `Conflicting package.json export outcomes for ${path}.`,
          }),
          dependencies: collectUniqueEntries({
            entries: depEntries,
            keyOf: (entry) => `${entry.field}:${entry.name}`,
            valueOf: (entry) => entry.value,
            toResult: (entry) => ({
              section: entry.field,
              name: entry.name,
              value: entry.value,
            }),
            errorMessage: `Conflicting package.json dependency outcomes for ${path}.`,
          }),
          scripts: collectUniqueEntries({
            entries: scriptEntries,
            keyOf: (entry) => entry.name,
            valueOf: (entry) => entry.value,
            toResult: (entry) => ({ name: entry.name, value: entry.value }),
            errorMessage: `Conflicting package.json script outcomes for ${path}.`,
          }),
        });

        return PlanningIntentPath.cases.packageJson.make({
          path,
          seed,
          ...fields,
        });
      });

    const barrel = (seed: string | undefined) =>
      collectUniqueEntries({
        entries: groups.barrel,
        keyOf: (entry) => entry.exportPath,
        valueOf: (entry) => entry.exportPath,
        toResult: (entry) => entry.exportPath,
        errorMessage: `Conflicting barrel export outcomes for ${path}.`,
      }).pipe(
        Effect.map((exportPaths) =>
          PlanningIntentPath.cases.barrel.make({ path, seed, exportPaths }),
        ),
      );

    const tsComposition = (seed: string | undefined) =>
      PlanningIntentPath.cases.tsComposition.make({
        path,
        seed,
        compositions: Arr.map(groups.tsCallArg, (entry) => ({
          targetVariable: entry.targetVariable,
          functionName: entry.functionName,
          argument: entry.argument,
          import: entry.import,
        })),
        objectFields: Arr.map(groups.tsObjectField, (entry) => ({
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
        jsxSlots: Arr.map(groups.jsxSlot, (entry) => ({
          slotId: entry.slotId,
          content: entry.content,
          import: entry.import,
        })),
      });

    return yield* Match.value(family).pipe(
      Match.when("authoritative", () =>
        Effect.gen(function* () {
          const contents = yield* resolveContents();

          return groups.authoritative.some((entry) => entry.conflictOnModify)
            ? PlanningIntentPath.cases.conflictOnModify.make({ path, contents })
            : PlanningIntentPath.cases.authoritative.make({ path, contents });
        }),
      ),
      Match.when("packageJson", () => packageJson(undefined)),
      Match.when("barrel", () => barrel(undefined)),
      Match.when("tsCallArg", () => Effect.succeed(tsComposition(undefined))),
      Match.when("jsxSlot", () => Effect.succeed(jsxSlot(undefined))),
      Match.when("authoritativePackageJson", () =>
        Effect.flatMap(resolveContents(), packageJson),
      ),
      Match.when("authoritativeTsCallArg", () =>
        Effect.map(resolveContents(), tsComposition),
      ),
      Match.when("authoritativeBarrel", () =>
        Effect.flatMap(resolveContents(), barrel),
      ),
      Match.when("authoritativeJsxSlot", () =>
        Effect.map(resolveContents(), jsxSlot),
      ),
      Match.exhaustive,
    );
  });

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

const derivePlanningIntentFamily = ({
  entries,
  path,
}: {
  entries: ReadonlyArray<PlanningIntentEntry>;
  path: string;
}) => {
  const families = new Set(Arr.map(entries, toPlanningIntentFamily));

  if (families.size === 1) {
    return pipe(
      Arr.head(entries),
      Option.match({
        onNone: () =>
          Effect.fail(
            new PlanFailure({
              message: `No planning intents found for ${path}.`,
            }),
          ),
        onSome: (entry) => Effect.succeed(toPlanningIntentFamily(entry)),
      }),
    );
  }

  if (families.size === 2) {
    const match = COMPOSITE_FAMILIES.find(
      ({ pair }) => families.has(pair[0]) && families.has(pair[1]),
    );
    if (match) {
      return Effect.succeed(match.result);
    }
  }

  return Effect.fail(
    new PlanFailure({
      message: `Conflicting planning intents for ${path}.`,
    }),
  );
};

type PlanningIntentFamily =
  | "authoritative"
  | "packageJson"
  | "barrel"
  | "tsCallArg"
  | "jsxSlot";

const toPlanningIntentFamily = PlanningIntentEntry.match({
  authoritative: () => "authoritative" as const,
  packageJsonEntry: () => "packageJson" as const,
  barrelExport: () => "barrel" as const,
  tsCallArg: () => "tsCallArg" as const,
  tsObjectField: () => "tsCallArg" as const,
  jsxSlot: () => "jsxSlot" as const,
}) satisfies (entry: PlanningIntentEntry) => PlanningIntentFamily;

const requireSingleValue = <Value>({
  values,
  errorMessage,
}: {
  values: ReadonlyArray<Value>;
  errorMessage: string;
}) =>
  pipe(
    Arr.head(values),
    Option.match({
      onNone: () =>
        Effect.fail(
          new PlanFailure({
            message: errorMessage,
          }),
        ),
      onSome: (firstValue) =>
        Arr.every(values, (value) => value === firstValue)
          ? Effect.succeed(firstValue)
          : Effect.fail(
              new PlanFailure({
                message: errorMessage,
              }),
            ),
    }),
  );

const collectUniqueEntries = <Entry, Result>({
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
}) =>
  Effect.all(
    Record.collect(Arr.groupBy(entries, keyOf), (_, groupedEntries) =>
      pipe(
        Arr.head(groupedEntries),
        Option.match({
          onNone: () =>
            Effect.fail(
              new PlanFailure({
                message: errorMessage,
              }),
            ),
          onSome: (firstEntry) =>
            requireSingleValue({
              values: Arr.map(groupedEntries, valueOf),
              errorMessage,
            }).pipe(Effect.as(toResult(firstEntry))),
        }),
      ),
    ),
  );
