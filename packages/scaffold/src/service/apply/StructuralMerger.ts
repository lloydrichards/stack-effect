import { ApplyFailure } from "@repo/domain/Apply";
import type { RequiredStructure } from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  Schema,
  String as Str,
} from "effect";

type StructuralMergeMode = "create" | "modify" | "override";

type StructuralMergeInput = {
  readonly path: string;
  readonly required: typeof RequiredStructure.Type;
  readonly existing: Option.Option<string>;
  readonly mode: StructuralMergeMode;
};

export class StructuralMerger extends Context.Service<StructuralMerger>()(
  "@repo/scaffold/service/apply/StructuralMerger",
  {
    make: Effect.succeed({
      merge: Effect.fn("StructuralMerger.merge")(function* (
        input: StructuralMergeInput,
      ) {
        const { path, required } = input;
        const isPackageJsonStructure = Arr.some(
          [required.exports, required.dependencies, required.scripts],
          (section) => section !== undefined,
        );
        const isBarrelStructure = required.reExports !== undefined;

        const contents = Match.value({
          isPackageJsonStructure,
          isBarrelStructure,
        }).pipe(
          Match.when(
            { isPackageJsonStructure: true, isBarrelStructure: false },
            () => mergePackageJsonContents(input),
          ),
          Match.when(
            { isPackageJsonStructure: false, isBarrelStructure: true },
            () => mergeBarrelContents(input),
          ),
          Match.when(
            { isPackageJsonStructure: true, isBarrelStructure: true },
            () => {
              throw new ApplyFailure({
                reason: "executionFailure",
                message: `Invalid structural outcome for ${path}: mixed package.json and barrel structure.`,
              });
            },
          ),
          Match.orElse(() => {
            throw new ApplyFailure({
              reason: "executionFailure",
              message: `Invalid structural outcome for ${path}: required structure is empty.`,
            });
          }),
        );

        return {
          path,
          contents,
        } as const;
      }),
    }),
  },
) {
  static layer = Layer.effect(StructuralMerger, StructuralMerger.make);
}

const mergePackageJsonContents = ({
  path,
  required,
  existing,
  mode,
}: StructuralMergeInput): string => {
  assertWriteModeContentExpectation({
    path,
    existing,
    mode,
  });

  const root = resolvePackageJsonRoot({
    path,
    existing,
    mode,
  });

  if (required.exports !== undefined) {
    root["exports"] = mergeFlatStringEntries({
      base: parseFlatStringRecord({
        path,
        fieldName: "exports",
        existing: root["exports"],
        mode,
      }),
      entries: sortByLocale(required.exports, (entry) => entry.name),
      keyOf: (entry) => entry.name,
      valueOf: (entry) => entry.value,
    });
  }

  if (required.dependencies !== undefined) {
    Arr.reduce(
      sortByLocale(required.dependencies, (section) => section.section),
      root,
      (nextRoot, section) => {
        nextRoot[section.section] = mergeFlatStringEntries({
          base: parseFlatStringRecord({
            path,
            fieldName: section.section,
            existing: nextRoot[section.section],
            mode,
          }),
          entries: sortByLocale(section.entries, (entry) => entry.name),
          keyOf: (entry) => entry.name,
          valueOf: (entry) => entry.value,
        });

        return nextRoot;
      },
    );
  }

  if (required.scripts !== undefined) {
    root["scripts"] = mergeFlatStringEntries({
      base: parseFlatStringRecord({
        path,
        fieldName: "scripts",
        existing: root["scripts"],
        mode,
      }),
      entries: sortByLocale(required.scripts, (entry) => entry.name),
      keyOf: (entry) => entry.name,
      valueOf: (entry) => entry.value,
    });
  }

  return `${Schema.encodeSync(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
  )(root)}\n`;
};

const resolvePackageJsonRoot = ({
  path,
  existing,
  mode,
}: {
  path: string;
  existing: Option.Option<string>;
  mode: StructuralMergeMode;
}): Record<string, Schema.Json> => {
  return Match.value(mode).pipe(
    Match.when("create", () => ({})),
    Match.orElse(() =>
      Option.match(existing, {
        onNone: () => ({}),
        onSome: (contents) => {
          const parsed = Schema.decodeUnknownOption(
            Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
          )(contents);

          if (Option.isSome(parsed)) {
            return { ...parsed.value };
          }

          if (mode === "override") {
            return {};
          }

          throw new ApplyFailure({
            reason: "executionFailure",
            message: `Expected ${path} to be a valid package.json object during apply.`,
          });
        },
      }),
    ),
  );
};

const parseFlatStringRecord = ({
  path,
  fieldName,
  existing,
  mode,
}: {
  path: string;
  fieldName: string;
  existing: unknown;
  mode: StructuralMergeMode;
}): Record<string, string> => {
  if (existing === undefined) {
    return {};
  }

  const parsed = Schema.decodeUnknownOption(
    Schema.Record(Schema.String, Schema.String),
  )(existing);

  if (Option.isSome(parsed)) {
    return { ...parsed.value };
  }

  if (mode === "override") {
    return {};
  }

  throw new ApplyFailure({
    reason: "executionFailure",
    message: `Expected ${path}.${fieldName} to be a flat string record during apply.`,
  });
};

const mergeBarrelContents = ({
  path,
  required,
  existing,
  mode,
}: StructuralMergeInput): string => {
  const requiredReExports = Arr.fromIterable(
    new Set(required.reExports ?? []),
  ).sort((left, right) => left.localeCompare(right));

  if (requiredReExports.length === 0) {
    throw new ApplyFailure({
      reason: "executionFailure",
      message: `Expected ${path} to declare at least one required re-export during apply.`,
    });
  }

  assertWriteModeContentExpectation({
    path,
    existing,
    mode,
  });

  return Match.value(mode).pipe(
    Match.when("override", () => serializeBarrelExports(requiredReExports)),
    Match.orElse(() =>
      Option.match(existing, {
        onNone: () => serializeBarrelExports(requiredReExports),
        onSome: (contents) =>
          Match.value(parseSimpleBarrelExports(contents)).pipe(
            Match.when(undefined, () => {
              throw new ApplyFailure({
                reason: "executionFailure",
                message: `Expected ${path} to contain only simple barrel exports during apply.`,
              });
            }),
            Match.orElse((existingExports) =>
              serializeBarrelExports(
                Arr.fromIterable(
                  new Set([...existingExports, ...requiredReExports]),
                ).sort((left, right) => left.localeCompare(right)),
              ),
            ),
          ),
      }),
    ),
  );
};

const assertWriteModeContentExpectation = ({
  path,
  existing,
  mode,
}: {
  path: string;
  existing: Option.Option<string>;
  mode: StructuralMergeMode;
}): void =>
  Match.value({
    mode,
    hasExistingContents: Option.isSome(existing),
  }).pipe(
    Match.when({ mode: "create", hasExistingContents: true }, () => {
      throw new ApplyFailure({
        reason: "executionFailure",
        message: `Expected ${path} to be missing for create apply mode.`,
      });
    }),
    Match.when({ mode: "modify", hasExistingContents: false }, () => {
      throw new ApplyFailure({
        reason: "executionFailure",
        message: `Expected ${path} to exist for modify apply mode.`,
      });
    }),
    Match.orElse(() => undefined),
  );

const serializeBarrelExports = (exports: ReadonlyArray<string>): string =>
  `${Arr.join(
    Arr.map(exports, (entry) => `export * from "${entry}";`),
    "\n",
  )}\n`;

const parseSimpleBarrelExports = (
  contents: string,
): ReadonlyArray<string> | undefined => {
  const parsedExports = Arr.map(
    Arr.filter(Str.split(contents, /\r?\n/u), (line) => Str.trim(line) !== ""),
    (line) => line.match(/^export \* from "(\.[^"]*)";$/)?.[1],
  );

  return Arr.every(parsedExports, (d) => d !== undefined)
    ? parsedExports
    : undefined;
};

const sortByLocale = <Value>(
  values: ReadonlyArray<Value>,
  toKey: (value: Value) => string,
): ReadonlyArray<Value> =>
  Arr.fromIterable(values).sort((left, right) =>
    toKey(left).localeCompare(toKey(right)),
  );

const mergeFlatStringEntries = <Entry>({
  base,
  entries,
  keyOf,
  valueOf,
}: {
  base: Record<string, string>;
  entries: ReadonlyArray<Entry>;
  keyOf: (entry: Entry) => string;
  valueOf: (entry: Entry) => string;
}): Record<string, string> =>
  Arr.reduce(entries, { ...base }, (nextRecord, entry) => {
    nextRecord[keyOf(entry)] = valueOf(entry);
    return nextRecord;
  });
