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
  readonly requiredStructure: typeof RequiredStructure.Type;
  readonly existingContents: Option.Option<string>;
  readonly writeMode: StructuralMergeMode;
};

export class StructuralMerger extends Context.Service<StructuralMerger>()(
  "@repo/scaffold/service/apply/StructuralMerger",
  {
    make: Effect.succeed({
      merge: Effect.fn("StructuralMerger.merge")(function* (
        input: StructuralMergeInput,
      ) {
        const { path, requiredStructure } = input;
        const isPackageJsonStructure = Arr.some(
          [
            requiredStructure.packageJsonExports,
            requiredStructure.packageJsonDependencies,
            requiredStructure.packageJsonScripts,
          ],
          (section) => section !== undefined,
        );
        const isBarrelStructure = requiredStructure.reExports !== undefined;

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
  requiredStructure,
  existingContents,
  writeMode,
}: StructuralMergeInput): string => {
  assertWriteModeContentExpectation({
    path,
    existingContents,
    writeMode,
  });

  const root = resolvePackageJsonRoot({
    path,
    existingContents,
    writeMode,
  });

  if (requiredStructure.packageJsonExports !== undefined) {
    root["exports"] = mergeFlatStringEntries({
      base: parseFlatStringRecord({
        path,
        fieldName: "exports",
        existingValue: root["exports"],
        writeMode,
      }),
      entries: sortByLocale(
        requiredStructure.packageJsonExports,
        (entry) => entry.exportKey,
      ),
      keyOf: (entry) => entry.exportKey,
      valueOf: (entry) => entry.exportValue,
    });
  }

  if (requiredStructure.packageJsonDependencies !== undefined) {
    Arr.reduce(
      sortByLocale(
        requiredStructure.packageJsonDependencies,
        (section) => section.section,
      ),
      root,
      (nextRoot, section) => {
        nextRoot[section.section] = mergeFlatStringEntries({
          base: parseFlatStringRecord({
            path,
            fieldName: section.section,
            existingValue: nextRoot[section.section],
            writeMode,
          }),
          entries: sortByLocale(
            section.entries,
            (entry) => entry.dependencyName,
          ),
          keyOf: (entry) => entry.dependencyName,
          valueOf: (entry) => entry.dependencyValue,
        });

        return nextRoot;
      },
    );
  }

  if (requiredStructure.packageJsonScripts !== undefined) {
    root["scripts"] = mergeFlatStringEntries({
      base: parseFlatStringRecord({
        path,
        fieldName: "scripts",
        existingValue: root["scripts"],
        writeMode,
      }),
      entries: sortByLocale(
        requiredStructure.packageJsonScripts,
        (entry) => entry.scriptName,
      ),
      keyOf: (entry) => entry.scriptName,
      valueOf: (entry) => entry.scriptValue,
    });
  }

  return `${Schema.encodeSync(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
  )(root)}\n`;
};

const resolvePackageJsonRoot = ({
  path,
  existingContents,
  writeMode,
}: {
  path: string;
  existingContents: Option.Option<string>;
  writeMode: StructuralMergeMode;
}): Record<string, Schema.Json> => {
  return Match.value(writeMode).pipe(
    Match.when("create", () => ({})),
    Match.orElse(() =>
      Option.match(existingContents, {
        onNone: () => ({}),
        onSome: (contents) => {
          const parsed = Schema.decodeUnknownOption(
            Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
          )(contents);

          if (Option.isSome(parsed)) {
            return { ...parsed.value };
          }

          if (writeMode === "override") {
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
  existingValue,
  writeMode,
}: {
  path: string;
  fieldName: string;
  existingValue: unknown;
  writeMode: StructuralMergeMode;
}): Record<string, string> => {
  if (existingValue === undefined) {
    return {};
  }

  const parsed = Schema.decodeUnknownOption(
    Schema.Record(Schema.String, Schema.String),
  )(existingValue);

  if (Option.isSome(parsed)) {
    return { ...parsed.value };
  }

  if (writeMode === "override") {
    return {};
  }

  throw new ApplyFailure({
    reason: "executionFailure",
    message: `Expected ${path}.${fieldName} to be a flat string record during apply.`,
  });
};

const mergeBarrelContents = ({
  path,
  requiredStructure,
  existingContents,
  writeMode,
}: StructuralMergeInput): string => {
  const requiredReExports = Arr.fromIterable(
    new Set(requiredStructure.reExports ?? []),
  ).sort((left, right) => left.localeCompare(right));

  if (requiredReExports.length === 0) {
    throw new ApplyFailure({
      reason: "executionFailure",
      message: `Expected ${path} to declare at least one required re-export during apply.`,
    });
  }

  assertWriteModeContentExpectation({
    path,
    existingContents,
    writeMode,
  });

  return Match.value(writeMode).pipe(
    Match.when("override", () => serializeBarrelExports(requiredReExports)),
    Match.orElse(() =>
      Option.match(existingContents, {
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
  existingContents,
  writeMode,
}: {
  path: string;
  existingContents: Option.Option<string>;
  writeMode: StructuralMergeMode;
}): void =>
  Match.value({
    writeMode,
    hasExistingContents: Option.isSome(existingContents),
  }).pipe(
    Match.when({ writeMode: "create", hasExistingContents: true }, () => {
      throw new ApplyFailure({
        reason: "executionFailure",
        message: `Expected ${path} to be missing for create apply mode.`,
      });
    }),
    Match.when({ writeMode: "modify", hasExistingContents: false }, () => {
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
