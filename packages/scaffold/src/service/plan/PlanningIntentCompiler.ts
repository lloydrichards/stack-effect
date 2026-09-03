import { Contribution } from "@repo/domain/Catalog";
import { PlanFailure } from "@repo/domain/Plan";
import type { NormalizedContributions } from "@repo/domain/Scaffold";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
  Record,
  Schema,
} from "effect";
import type { PlanningIntentPath } from "./PlanAssessor";

export interface PlanningIntentCompilerShape {
  readonly compile: (
    normalizedContributions: typeof NormalizedContributions.Type,
  ) => Effect.Effect<ReadonlyArray<PlanningIntentPath>, PlanFailure, never>;
}

export class PlanningIntentCompiler extends Context.Service<
  PlanningIntentCompiler,
  PlanningIntentCompilerShape
>()("PlanningIntentCompiler", {
  make: Effect.succeed({
    compile,
  } satisfies PlanningIntentCompilerShape),
}) {
  static readonly layer = Layer.effect(
    PlanningIntentCompiler,
    PlanningIntentCompiler.make,
  ).pipe(Layer.satisfiesServicesType<never>());
}

function compile(normalizedContributions: typeof NormalizedContributions.Type) {
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
    Record.collect(entriesByPath, (path, entries) =>
      derivePlanningIntentPath({ path, entries }),
    ),
  );
}

const PlanningIntentEntry = Schema.TaggedUnion({
  authoritative: {
    path: Schema.String,
    contents: Schema.String,
    conflictOnModify: Schema.Boolean,
  },
  packageJsonEntry: {
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
  barrelExport: {
    path: Schema.String,
    exportPath: Schema.String,
  },
  tsCallArg: {
    path: Schema.String,
    targetVariable: Schema.String,
    functionName: Schema.String,
    argument: Schema.String,
    import: Schema.Struct({
      moduleSpecifier: Schema.String,
      namedImports: Schema.Union([
        Schema.Array(Schema.String),
        Schema.Undefined,
      ]),
      defaultImport: Schema.Union([Schema.String, Schema.Undefined]),
      namespaceImport: Schema.Union([Schema.String, Schema.Undefined]),
    }),
  },
  tsObjectField: {
    path: Schema.String,
    targetVariable: Schema.String,
    functionName: Schema.String,
    field: Schema.String,
    value: Schema.String,
    import: Schema.Union([
      Schema.Struct({
        moduleSpecifier: Schema.String,
        namedImports: Schema.Union([
          Schema.Array(Schema.String),
          Schema.Undefined,
        ]),
        defaultImport: Schema.Union([Schema.String, Schema.Undefined]),
        namespaceImport: Schema.Union([Schema.String, Schema.Undefined]),
      }),
      Schema.Undefined,
    ]),
  },
  jsxSlot: {
    path: Schema.String,
    slotId: Schema.String,
    content: Schema.String,
    import: Schema.Union([
      Schema.Struct({
        moduleSpecifier: Schema.String,
        namedImports: Schema.Union([
          Schema.Array(Schema.String),
          Schema.Undefined,
        ]),
        defaultImport: Schema.Union([Schema.String, Schema.Undefined]),
        namespaceImport: Schema.Union([Schema.String, Schema.Undefined]),
      }),
      Schema.Undefined,
    ]),
  },
});

const toPlanningIntentEntries = (
  contributions: ReadonlyArray<typeof Contribution.Type>,
): ReadonlyArray<typeof PlanningIntentEntry.Type> =>
  Arr.flatMap(
    contributions,
    Contribution.match({
      file: (c): ReadonlyArray<typeof PlanningIntentEntry.Type> => [
        PlanningIntentEntry.cases.authoritative.make({
          path: c.path,
          contents: c.contents,
          conflictOnModify: c.conflictOnModify ?? false,
        }),
      ],
      "pkg-json-entry": (c): ReadonlyArray<typeof PlanningIntentEntry.Type> => [
        PlanningIntentEntry.cases.packageJsonEntry.make({
          path: c.path,
          field: c.field,
          name: c.name,
          value: c.value,
        }),
      ],
      "barrel-export": (c): ReadonlyArray<typeof PlanningIntentEntry.Type> => [
        PlanningIntentEntry.cases.barrelExport.make({
          path: c.barrelPath,
          exportPath: c.exportPath,
        }),
      ],
      "ts-call-arg": (c): ReadonlyArray<typeof PlanningIntentEntry.Type> => [
        PlanningIntentEntry.cases.tsCallArg.make({
          path: c.path,
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
      "ts-object-field": (
        c,
      ): ReadonlyArray<typeof PlanningIntentEntry.Type> => [
        PlanningIntentEntry.cases.tsObjectField.make({
          path: c.path,
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
      "jsx-slot": (c): ReadonlyArray<typeof PlanningIntentEntry.Type> => [
        PlanningIntentEntry.cases.jsxSlot.make({
          path: c.path,
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
  readonly authoritative: ReadonlyArray<
    typeof PlanningIntentEntry.cases.authoritative.Type
  >;
  readonly packageJson: ReadonlyArray<
    typeof PlanningIntentEntry.cases.packageJsonEntry.Type
  >;
  readonly barrel: ReadonlyArray<
    typeof PlanningIntentEntry.cases.barrelExport.Type
  >;
  readonly tsCallArg: ReadonlyArray<
    typeof PlanningIntentEntry.cases.tsCallArg.Type
  >;
  readonly tsObjectField: ReadonlyArray<
    typeof PlanningIntentEntry.cases.tsObjectField.Type
  >;
  readonly jsxSlot: ReadonlyArray<
    typeof PlanningIntentEntry.cases.jsxSlot.Type
  >;
};

const groupPlanningIntentEntries = (
  entries: ReadonlyArray<typeof PlanningIntentEntry.Type>,
): PlanningIntentEntryGroups => ({
  authoritative: entries.filter(PlanningIntentEntry.guards.authoritative),
  packageJson: entries.filter(PlanningIntentEntry.guards.packageJsonEntry),
  barrel: entries.filter(PlanningIntentEntry.guards.barrelExport),
  tsCallArg: entries.filter(PlanningIntentEntry.guards.tsCallArg),
  tsObjectField: entries.filter(PlanningIntentEntry.guards.tsObjectField),
  jsxSlot: entries.filter(PlanningIntentEntry.guards.jsxSlot),
});

const emptyPackageJsonFields = {
  exports: [],
  dependencies: [],
  scripts: [],
};

const emptyCompositionFields = {
  barrelExports: [],
  compositions: [],
  objectFields: [],
  jsxSlots: [],
};

const makePlanningIntentPath = ({
  path,
  contents,
  packageJsonFields = emptyPackageJsonFields,
  barrelExports = [],
  compositions = [],
  objectFields = [],
  jsxSlots = [],
  tsconfig,
}: {
  readonly path: string;
  readonly contents: string | undefined;
  readonly packageJsonFields?: Pick<
    PlanningIntentPath,
    "exports" | "dependencies" | "scripts"
  >;
  readonly barrelExports?: PlanningIntentPath["barrelExports"];
  readonly compositions?: PlanningIntentPath["compositions"];
  readonly objectFields?: PlanningIntentPath["objectFields"];
  readonly jsxSlots?: PlanningIntentPath["jsxSlots"];
  readonly tsconfig: PlanningIntentPath["tsconfig"];
}): PlanningIntentPath => ({
  path,
  contents,
  ...packageJsonFields,
  barrelExports,
  compositions,
  objectFields,
  jsxSlots,
  tsconfig,
});

const derivePlanningIntentPath = ({
  path,
  entries,
}: {
  path: string;
  entries: ReadonlyArray<typeof PlanningIntentEntry.Type>;
}) =>
  Effect.gen(function* () {
    const family = yield* derivePlanningIntentFamily({ entries, path });
    const groups = groupPlanningIntentEntries(entries);

    const resolveContents = () =>
      requireSingleValue({
        values: Arr.map(groups.authoritative, (entry) => entry.contents),
        errorMessage: `Conflicting authoritative file outcomes for ${path}.`,
      });

    const resolveConflictOnModify = () =>
      groups.authoritative.length > 0 &&
      groups.authoritative.some((e) => e.conflictOnModify);

    const resolvePackageJsonFields = () => {
      type PackageJsonCase =
        typeof PlanningIntentEntry.cases.packageJsonEntry.Type;

      const exportEntries = groups.packageJson.filter(
        (e): e is PackageJsonCase & { field: "exports" } =>
          e.field === "exports",
      );
      const depEntries = groups.packageJson.filter(
        (
          e,
        ): e is PackageJsonCase & {
          field: "dependencies" | "devDependencies";
        } => e.field === "dependencies" || e.field === "devDependencies",
      );
      const scriptEntries = groups.packageJson.filter(
        (e): e is PackageJsonCase & { field: "scripts" } =>
          e.field === "scripts",
      );

      return Effect.all({
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
    };

    const collectBarrelExports = () =>
      collectUniqueEntries({
        entries: groups.barrel,
        keyOf: (entry) => entry.exportPath,
        valueOf: (entry) => entry.exportPath,
        toResult: (entry) => ({ exportPath: entry.exportPath }),
        errorMessage: `Conflicting barrel export outcomes for ${path}.`,
      });

    const toCompositions = () =>
      Arr.map(groups.tsCallArg, (entry) => ({
        targetVariable: entry.targetVariable,
        functionName: entry.functionName,
        argument: entry.argument,
        import: entry.import,
      }));

    const toObjectFields = () =>
      Arr.map(groups.tsObjectField, (entry) => ({
        targetVariable: entry.targetVariable,
        functionName: entry.functionName,
        field: entry.field,
        value: entry.value,
        import: entry.import,
      }));

    const toJsxSlots = () =>
      Arr.map(groups.jsxSlot, (entry) => ({
        slotId: entry.slotId,
        content: entry.content,
        import: entry.import,
      }));

    return yield* Match.value(family).pipe(
      Match.when("authoritative", () =>
        Effect.gen(function* () {
          const contents = yield* resolveContents();
          const isConflictOnModify = resolveConflictOnModify();

          return makePlanningIntentPath({
            path,
            contents: isConflictOnModify ? undefined : contents,
            ...emptyCompositionFields,
            tsconfig: isConflictOnModify ? { path, contents } : undefined,
          });
        }),
      ),
      Match.when("packageJson", () =>
        Effect.gen(function* () {
          return makePlanningIntentPath({
            path,
            contents: undefined,
            packageJsonFields: yield* resolvePackageJsonFields(),
            ...emptyCompositionFields,
            tsconfig: undefined,
          });
        }),
      ),
      Match.when("barrel", () =>
        Effect.gen(function* () {
          return makePlanningIntentPath({
            path,
            contents: undefined,
            barrelExports: yield* collectBarrelExports(),
            tsconfig: undefined,
          });
        }),
      ),
      Match.when("tsCallArg", () =>
        Effect.succeed(
          makePlanningIntentPath({
            path,
            contents: undefined,
            compositions: toCompositions(),
            objectFields: toObjectFields(),
            tsconfig: undefined,
          }),
        ),
      ),
      Match.when("jsxSlot", () =>
        Effect.succeed(
          makePlanningIntentPath({
            path,
            contents: undefined,
            jsxSlots: toJsxSlots(),
            tsconfig: undefined,
          }),
        ),
      ),
      Match.when("authoritativePackageJson", () =>
        Effect.gen(function* () {
          return makePlanningIntentPath({
            path,
            contents: yield* resolveContents(),
            packageJsonFields: yield* resolvePackageJsonFields(),
            ...emptyCompositionFields,
            tsconfig: undefined,
          });
        }),
      ),
      Match.when("authoritativeTsCallArg", () =>
        Effect.gen(function* () {
          return makePlanningIntentPath({
            path,
            contents: yield* resolveContents(),
            compositions: toCompositions(),
            objectFields: toObjectFields(),
            tsconfig: undefined,
          });
        }),
      ),
      Match.when("authoritativeBarrel", () =>
        Effect.gen(function* () {
          return makePlanningIntentPath({
            path,
            contents: yield* resolveContents(),
            barrelExports: yield* collectBarrelExports(),
            tsconfig: undefined,
          });
        }),
      ),
      Match.when("authoritativeJsxSlot", () =>
        Effect.gen(function* () {
          return makePlanningIntentPath({
            path,
            contents: yield* resolveContents(),
            jsxSlots: toJsxSlots(),
            tsconfig: undefined,
          });
        }),
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
  entries: ReadonlyArray<typeof PlanningIntentEntry.Type>;
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
              reason: "invalidPlanIntent",
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
      reason: "invalidPlanIntent",
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
}) satisfies (entry: typeof PlanningIntentEntry.Type) => PlanningIntentFamily;

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
            reason: "invalidPlanIntent",
            message: errorMessage,
          }),
        ),
      onSome: (firstValue) =>
        Arr.every(values, (value) => value === firstValue)
          ? Effect.succeed(firstValue)
          : Effect.fail(
              new PlanFailure({
                reason: "invalidPlanIntent",
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
                reason: "invalidPlanIntent",
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
