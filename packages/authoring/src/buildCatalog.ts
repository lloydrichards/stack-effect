import {
  composeCatalog,
  templateCapabilities,
  V1_INTERPRETER_CAPABILITIES,
  validateCatalogCapabilities,
} from "@repo/catalog";
import {
  CatalogDocument,
  type CatalogIssueCode,
  type CatalogIssueSubject,
  ModuleDefinition,
  TargetDefinition,
} from "@repo/domain/Catalog";
import {
  Array as Arr,
  Data,
  Effect,
  FileSystem,
  Path,
  Predicate,
  Schema,
} from "effect";
import type { CatalogInput } from "./Define";
import { isTemplateRef, type TemplateRef } from "./Template";

export type CatalogBuildIssueCode =
  | CatalogIssueCode
  | "invalid-options"
  | "missing-template"
  | "unsupported-capability";

/** One build failure, located by its definition, source file and template. */
export interface CatalogBuildIssue {
  readonly subject: CatalogIssueSubject;
  readonly code: CatalogBuildIssueCode;
  readonly message: string;
  readonly sources: ReadonlyArray<string>;
  readonly template?: string;
}

const formatIssue = (issue: CatalogBuildIssue): string => {
  const location = [
    ...(issue.sources.length ? [issue.sources.join(", ")] : []),
    ...(issue.template === undefined ? [] : [`template ${issue.template}`]),
  ].join(" ");
  return location ? `${location}: ${issue.message}` : issue.message;
};

export class CatalogBuildError extends Data.TaggedError("CatalogBuildError")<{
  readonly issues: ReadonlyArray<CatalogBuildIssue>;
}> {
  override get message(): string {
    return ["Catalog build failed:", ...this.issues.map(formatIssue)].join(
      "\n  ",
    );
  }
}

export interface TemplateProvenance {
  readonly contribution: number;
  readonly field: string;
  readonly contributionPath: string;
  readonly template: string;
}

/** Where a definition and its template-backed contributions were authored. */
export interface DefinitionProvenance {
  readonly subject: CatalogIssueSubject;
  readonly source: string;
  readonly templates: ReadonlyArray<TemplateProvenance>;
}

export interface BuildCatalogOptions {
  readonly catalogId: string;
  /** Directory that reported source and template paths are relative to. */
  readonly root: URL | string;
  /** Contributed catalogs cannot ship Finalize scripts; loaders decide trust. */
  readonly finalizeScripts?: "reject" | "allow";
}

export interface BuildCatalogResult {
  readonly json: string;
  readonly document: CatalogDocument;
  readonly provenance: ReadonlyArray<DefinitionProvenance>;
}

/** One authored definition; `input` is unknown until the strict decode. */
interface Entry {
  readonly kind: "target" | "module";
  readonly subject: CatalogIssueSubject;
  readonly source: string;
  readonly input: unknown;
}

interface TemplateField {
  readonly entry: Entry;
  readonly entryIndex: number;
  readonly contribution: number;
  readonly field: string;
  readonly ref: TemplateRef;
}

interface ResolvedTemplate extends TemplateField {
  readonly template: string;
  readonly text: string;
}

const subjectKey = (subject: CatalogIssueSubject): string =>
  subject._tag === "module"
    ? `module:${subject.id}`
    : subject._tag === "target"
      ? `target:${subject.kind}`
      : "document";

const subjectLabel = (subject: CatalogIssueSubject): string =>
  subject._tag === "module"
    ? `Module ${subject.id}`
    : subject._tag === "target"
      ? `Target ${subject.kind}`
      : "Catalog";

/*
 * Untyped callers can pass malformed definitions. These guards only keep the
 * template scan from crashing; malformed values pass through unchanged so the
 * strict decode reports them against their source.
 */
const stringField = (input: unknown, key: string): string | undefined => {
  const value = Predicate.hasProperty(input, key) ? input[key] : undefined;
  return typeof value === "string" ? value : undefined;
};

const definitionsOf = (definitions: unknown): ReadonlyArray<unknown> =>
  Array.isArray(definitions) ? definitions : [definitions];

const contributionsOf = (entry: Entry): ReadonlyArray<unknown> | undefined =>
  Predicate.hasProperty(entry.input, "contributions") &&
  Array.isArray(entry.input.contributions)
    ? entry.input.contributions
    : undefined;

const fieldsOf = (contribution: unknown) =>
  Predicate.isObject(contribution) ? Object.entries(contribution) : [];

const fail = (issues: ReadonlyArray<CatalogBuildIssue>) =>
  Effect.fail(new CatalogBuildError({ issues }));

const decodeUtf8 = (bytes: Uint8Array) =>
  Effect.try({
    try: () =>
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    catch: () => "is not valid UTF-8",
  });

/**
 * Build a deterministic v1 catalog document from authored definitions.
 *
 * Stages run in order (templates, definition shape, references, interpreter
 * capabilities) and the build stops after the first stage that reports issues.
 */
export const buildCatalog = Effect.fn("Authoring.buildCatalog")(function* (
  catalog: CatalogInput,
  options: BuildCatalogOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const documentSubject: CatalogIssueSubject = { _tag: "document" };

  const catalogId = yield* Schema.decodeEffect(Schema.NonEmptyString)(
    options.catalogId,
  ).pipe(
    Effect.catch(() =>
      fail([
        {
          subject: documentSubject,
          code: "invalid-options",
          message: "catalogId must be a non-empty string",
          sources: [],
        },
      ]),
    ),
  );
  const toFilePath = (url: URL | string) =>
    Effect.try({
      try: () => new URL(url),
      catch: () => "is not a URL",
    }).pipe(
      Effect.flatMap((parsed) =>
        path
          .fromFileUrl(parsed)
          .pipe(Effect.mapError(() => "is not a file URL")),
      ),
    );
  const rootPath = yield* toFilePath(options.root).pipe(
    Effect.catch(() =>
      fail([
        {
          subject: documentSubject,
          code: "invalid-options",
          message: `root ${String(options.root)} is not a file URL`,
          sources: [],
        },
      ]),
    ),
  );
  const display = (url: string) =>
    toFilePath(url).pipe(
      Effect.map((file) =>
        path.relative(rootPath, file).split(path.sep).join("/"),
      ),
      Effect.orElseSucceed(() => url),
    );

  const entries: ReadonlyArray<Entry> = yield* Effect.all([
    Effect.forEach(catalog.targets, (group) =>
      Effect.map(display(group.source), (source) =>
        definitionsOf(group.definitions).map((input): Entry => ({
          kind: "target",
          subject: {
            _tag: "target",
            kind: stringField(input, "kind") ?? "(missing)",
          },
          source,
          input,
        })),
      ),
    ),
    Effect.forEach(catalog.modules, (group) =>
      Effect.map(display(group.source), (source) =>
        definitionsOf(group.definitions).map((input): Entry => ({
          kind: "module",
          subject: {
            _tag: "module",
            id: stringField(input, "id") ?? "(missing)",
          },
          source,
          input,
        })),
      ),
    ),
  ]).pipe(Effect.map(([targets, modules]) => [...targets, ...modules].flat()));

  const sourcesBySubject = Arr.reduce(
    entries,
    new Map<string, ReadonlyArray<string>>(),
    (sources, entry) => {
      const key = subjectKey(entry.subject);
      const known = sources.get(key) ?? [];
      return sources.set(
        key,
        known.includes(entry.source) ? known : [...known, entry.source],
      );
    },
  );
  const sourcesOf = (subject: CatalogIssueSubject) =>
    sourcesBySubject.get(subjectKey(subject)) ?? [];

  const templateFields: ReadonlyArray<TemplateField> = entries.flatMap(
    (entry, entryIndex) =>
      (contributionsOf(entry) ?? []).flatMap(
        (contribution, contributionIndex) =>
          fieldsOf(contribution).flatMap(([field, value]) =>
            isTemplateRef(value)
              ? [
                  {
                    entry,
                    entryIndex,
                    contribution: contributionIndex,
                    field,
                    ref: value,
                  },
                ]
              : [],
          ),
      ),
  );
  const [missing, resolved] = yield* Effect.partition(templateFields, (item) =>
    Effect.gen(function* () {
      const template = yield* display(item.ref.url);
      const text = yield* toFilePath(item.ref.url).pipe(
        Effect.flatMap((file) =>
          fs.readFile(file).pipe(Effect.mapError(() => "could not be read")),
        ),
        Effect.flatMap(decodeUtf8),
        Effect.mapError((reason): CatalogBuildIssue => ({
          subject: item.entry.subject,
          code: "missing-template",
          message: `${subjectLabel(item.entry.subject)} contribution ${item.contribution} ${item.field} template ${reason}`,
          sources: [item.entry.source],
          template,
        })),
      );
      return { ...item, template, text } satisfies ResolvedTemplate;
    }),
  );
  if (missing.length) return yield* fail(missing);

  const textAt = new Map(
    resolved.map((item) => [
      `${item.entryIndex}:${item.contribution}:${item.field}`,
      item.text,
    ]),
  );
  const resolveContribution = (
    contribution: unknown,
    entryIndex: number,
    contributionIndex: number,
  ): unknown =>
    Predicate.isObject(contribution)
      ? Object.fromEntries(
          fieldsOf(contribution).map(([field, value]) => [
            field,
            isTemplateRef(value)
              ? textAt.get(`${entryIndex}:${contributionIndex}:${field}`)
              : value,
          ]),
        )
      : contribution;
  const resolveInput = (entry: Entry, entryIndex: number): unknown => {
    const contributions = contributionsOf(entry);
    return contributions && Predicate.isObject(entry.input)
      ? {
          ...entry.input,
          contributions: contributions.map((contribution, index) =>
            resolveContribution(contribution, entryIndex, index),
          ),
        }
      : entry.input;
  };

  type Decoded =
    | { readonly _tag: "target"; readonly target: typeof TargetDefinition.Type }
    | {
        readonly _tag: "module";
        readonly module: typeof ModuleDefinition.Type;
      };
  const decodeEntry = (
    entry: Entry,
    entryIndex: number,
  ): Effect.Effect<Decoded, CatalogBuildIssue> => {
    const input = resolveInput(entry, entryIndex);
    const decoded: Effect.Effect<Decoded, Schema.SchemaError> =
      entry.kind === "target"
        ? Schema.decodeUnknownEffect(TargetDefinition)(input, {
            onExcessProperty: "error",
          }).pipe(Effect.map((target) => ({ _tag: "target", target })))
        : Schema.decodeUnknownEffect(ModuleDefinition)(input, {
            onExcessProperty: "error",
          }).pipe(Effect.map((module) => ({ _tag: "module", module })));
    return decoded.pipe(
      Effect.mapError((error) => ({
        subject: entry.subject,
        code: "invalid-shape",
        message: `${subjectLabel(entry.subject)} is invalid: ${error.message}`,
        sources: [entry.source],
      })),
    );
  };
  const [invalid, decoded] = yield* Effect.partition(
    entries.map((entry, index) => [entry, index] as const),
    ([entry, index]) => decodeEntry(entry, index),
  );
  if (invalid.length) return yield* fail(invalid);

  const definitions = yield* composeCatalog(
    [
      {
        targets: decoded.flatMap((item) =>
          item._tag === "target" ? [item.target] : [],
        ),
        modules: decoded.flatMap((item) =>
          item._tag === "module" ? [item.module] : [],
        ),
      },
    ],
    options.finalizeScripts === "allow" ? { trustedFragmentIndex: 0 } : {},
  ).pipe(
    Effect.catchTag("CatalogValidationError", (error) =>
      fail(
        error.details.map((issue) => ({
          subject: issue.subject,
          code: issue.code,
          message: issue.message,
          sources: sourcesOf(issue.subject),
        })),
      ),
    ),
  );

  const document: CatalogDocument = {
    formatVersion: 1,
    catalogId,
    requiredCapabilities: V1_INTERPRETER_CAPABILITIES,
    ...definitions,
  };
  const templatesOf = (subject: CatalogIssueSubject) =>
    resolved.filter(
      (item) => subjectKey(item.entry.subject) === subjectKey(subject),
    );
  yield* validateCatalogCapabilities(document).pipe(
    Effect.catchTag("CatalogCapabilityError", (error) =>
      fail(
        error.details.flatMap(({ subject, capability }) => {
          const issue: CatalogBuildIssue = {
            subject,
            code: "unsupported-capability",
            message:
              subject._tag === "document"
                ? `Catalog declares unsupported capability ${capability}`
                : `${subjectLabel(subject)} uses unsupported capability ${capability}`,
            sources: sourcesOf(subject),
          };
          const using = templatesOf(subject).filter((item) =>
            templateCapabilities(item.text).includes(capability),
          );
          return using.length
            ? using.map((item) => ({ ...issue, template: item.template }))
            : [issue];
        }),
      ),
    ),
  );

  const json = yield* Schema.encodeEffect(
    Schema.fromJsonString(CatalogDocument),
  )(document).pipe(Effect.orDie);
  const provenance: ReadonlyArray<DefinitionProvenance> = entries.map(
    (entry, entryIndex) => ({
      subject: entry.subject,
      source: entry.source,
      templates: (contributionsOf(entry) ?? []).flatMap(
        (contribution, contributionIndex) => {
          const output = resolveContribution(
            contribution,
            entryIndex,
            contributionIndex,
          );
          return resolved
            .filter(
              (item) =>
                item.entryIndex === entryIndex &&
                item.contribution === contributionIndex,
            )
            .map((item) => ({
              contribution: contributionIndex,
              field: item.field,
              contributionPath:
                stringField(output, "path") ??
                stringField(output, "barrelPath") ??
                "",
              template: item.template,
            }));
        },
      ),
    }),
  );
  return {
    json: `${json}\n`,
    document,
    provenance,
  } satisfies BuildCatalogResult;
});
