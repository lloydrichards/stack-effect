import {
  composeCatalog,
  templateCapabilities,
  V1_INTERPRETER_CAPABILITIES,
  validateCatalogCapabilities,
} from "@repo/catalog";
import {
  CatalogDocument,
  type CatalogIssue,
  CatalogIssueCode,
  CatalogIssueSubject,
  catalogIssueKey,
  catalogIssueLabel,
  ModuleDefinition,
  TargetDefinition,
} from "@repo/domain/Catalog";
import {
  Array as Arr,
  Data,
  Effect,
  FileSystem,
  Option,
  Path,
  Predicate,
  Schema,
} from "effect";
import type { CatalogInput, DefinitionGroup } from "./Define";
import { isTemplateRef, type TemplateRef } from "./Template";

export const CatalogBuildIssueCode = Schema.Union([
  CatalogIssueCode,
  Schema.Literals([
    "invalid-options",
    "missing-template",
    "invalid-template",
    "unsupported-capability",
  ]),
]);
export type CatalogBuildIssueCode = typeof CatalogBuildIssueCode.Type;

/** One build failure, located by its definition, source file and template. */
export const CatalogBuildIssue = Schema.Struct({
  subject: CatalogIssueSubject,
  code: CatalogBuildIssueCode,
  message: Schema.String,
  sources: Schema.Array(Schema.String),
  template: Schema.optionalKey(Schema.String),
});
export type CatalogBuildIssue = typeof CatalogBuildIssue.Type;

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

export const TemplateProvenance = Schema.Struct({
  contribution: Schema.Int,
  field: Schema.String,
  contributionPath: Schema.String,
  template: Schema.String,
});
export type TemplateProvenance = typeof TemplateProvenance.Type;

/** Where a definition and its template-backed contributions were authored. */
export const DefinitionProvenance = Schema.Struct({
  subject: CatalogIssueSubject,
  source: Schema.String,
  templates: Schema.Array(TemplateProvenance),
});
export type DefinitionProvenance = typeof DefinitionProvenance.Type;

export interface BuildCatalogOptions {
  readonly catalogId: string;
  /**
   * Directory, as a file URL or absolute path, that every source and template
   * must live in. Reported paths are relative to it, so builds are portable.
   */
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

type Decoded =
  | { readonly _tag: "target"; readonly target: typeof TargetDefinition.Type }
  | { readonly _tag: "module"; readonly module: typeof ModuleDefinition.Type };

const documentSubject: CatalogIssueSubject = { _tag: "document" };

const fail = (issues: ReadonlyArray<CatalogBuildIssue>) =>
  Effect.fail(new CatalogBuildError({ issues }));

const failWhenAny = (issues: ReadonlyArray<CatalogBuildIssue>) =>
  issues.length ? fail(issues) : Effect.void;

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

/** Strings authored inline in a definition, skipping template references. */
const inlineStrings = (value: unknown): ReadonlyArray<string> =>
  typeof value === "string"
    ? [value]
    : isTemplateRef(value)
      ? []
      : Array.isArray(value)
        ? value.flatMap(inlineStrings)
        : Predicate.isObject(value)
          ? Object.values(value).flatMap(inlineStrings)
          : [];

const templateFieldKey = (
  entryIndex: number,
  contribution: number,
  field: string,
) => `${entryIndex}:${contribution}:${field}`;

const decodeUtf8 = (bytes: Uint8Array) =>
  Effect.try({
    try: () =>
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    catch: () => "is not valid UTF-8",
  });

/**
 * Resolves file URLs and absolute paths, confined to the catalog root. Paths
 * are compared after resolving symlinks, so a link cannot reach outside root.
 */
const makeLocations = Effect.fn("Authoring.locations")(function* (
  root: URL | string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const toFilePath = (location: URL | string) =>
    typeof location === "string" && path.isAbsolute(location)
      ? Effect.succeed(path.resolve(location))
      : Effect.try({
          try: () => new URL(location),
          catch: () => "is not a file URL or absolute path",
        }).pipe(
          Effect.flatMap((url) =>
            path
              .fromFileUrl(url)
              .pipe(
                Effect.mapError(() => "is not a file URL or absolute path"),
              ),
          ),
        );
  /** The real path of a file, or of its parent when the file does not exist. */
  const realPathOf = (file: string) =>
    fs.realPath(file).pipe(
      Effect.catch(() =>
        fs.realPath(path.dirname(file)).pipe(
          Effect.map((directory) => path.join(directory, path.basename(file))),
          Effect.orElseSucceed(() => file),
        ),
      ),
    );
  const rootPath = yield* toFilePath(root).pipe(
    Effect.flatMap((file) =>
      fs
        .realPath(file)
        .pipe(Effect.mapError(() => "is not an existing directory")),
    ),
    Effect.catch((reason) =>
      fail([
        {
          subject: documentSubject,
          code: "invalid-options",
          message: `root ${String(root)} ${reason}`,
          sources: [],
        },
      ]),
    ),
  );
  /** A location as a root-relative POSIX path, failing outside the root. */
  const withinRoot = (location: URL | string) =>
    toFilePath(location).pipe(
      Effect.flatMap(realPathOf),
      Effect.flatMap((file) => {
        const relative = path.relative(rootPath, file);
        return relative === "" ||
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
          ? Effect.fail("is outside the catalog root")
          : Effect.succeed({
              file,
              display: relative.split(path.sep).join("/"),
            });
      }),
    );
  return { withinRoot };
});

type Locations = Effect.Success<ReturnType<typeof makeLocations>>;

const collectEntries = Effect.fn("Authoring.collectEntries")(function* (
  catalog: CatalogInput,
  locations: Locations,
) {
  const groups = [
    ...catalog.targets.map((group) => ["target", group] as const),
    ...catalog.modules.map((group) => ["module", group] as const),
  ] satisfies ReadonlyArray<
    readonly ["target" | "module", DefinitionGroup<unknown>]
  >;
  const [invalid, sources] = yield* Effect.partition(groups, ([, group]) =>
    locations.withinRoot(group.source).pipe(
      Effect.map(({ display }) => display),
      Effect.mapError((reason): CatalogBuildIssue => ({
        subject: documentSubject,
        code: "invalid-options",
        message: `Definition source ${String(group.source)} ${reason}`,
        sources: [],
      })),
    ),
  );
  yield* failWhenAny(invalid);
  return groups.flatMap(([kind, group], index) => {
    const source = sources[index] ?? String(group.source);
    return definitionsOf(group.definitions).map((input, position): Entry => {
      const label =
        stringField(input, kind === "target" ? "kind" : "id") ??
        `(unnamed ${kind} ${position + 1} in ${source})`;
      return {
        kind,
        subject:
          kind === "target"
            ? { _tag: "target", kind: label }
            : { _tag: "module", id: label },
        source,
        input,
      };
    });
  });
});

const resolveTemplates = Effect.fn("Authoring.resolveTemplates")(function* (
  entries: ReadonlyArray<Entry>,
  locations: Locations,
) {
  const fs = yield* FileSystem.FileSystem;
  const fields: ReadonlyArray<TemplateField> = entries.flatMap(
    (entry, entryIndex) =>
      (contributionsOf(entry) ?? []).flatMap((contribution, index) =>
        fieldsOf(contribution).flatMap(([field, value]) =>
          isTemplateRef(value)
            ? [{ entry, entryIndex, contribution: index, field, ref: value }]
            : [],
        ),
      ),
  );
  const [failed, resolved] = yield* Effect.partition(fields, (item) => {
    const issue = (
      code: "missing-template" | "invalid-template",
      reason: string,
      template: string,
    ): CatalogBuildIssue => ({
      subject: item.entry.subject,
      code,
      message: `${catalogIssueLabel(item.entry.subject)} contribution ${item.contribution} ${item.field} template ${reason}`,
      sources: [item.entry.source],
      template,
    });
    return locations.withinRoot(item.ref.url).pipe(
      Effect.mapError((reason) =>
        issue("invalid-template", reason, item.ref.url),
      ),
      Effect.flatMap(({ file, display }) =>
        fs.stat(file).pipe(
          Effect.mapError((error) =>
            error.reason._tag === "NotFound"
              ? issue("missing-template", "was not found", display)
              : issue("missing-template", "could not be read", display),
          ),
          Effect.flatMap((info) =>
            info.type === "File"
              ? fs
                  .readFile(file)
                  .pipe(
                    Effect.mapError(() =>
                      issue("missing-template", "could not be read", display),
                    ),
                  )
              : Effect.fail(
                  issue("invalid-template", "is not a file", display),
                ),
          ),
          Effect.flatMap((bytes) =>
            decodeUtf8(bytes).pipe(
              Effect.mapError((reason) =>
                issue("invalid-template", reason, display),
              ),
            ),
          ),
          Effect.map((text): ResolvedTemplate => ({
            ...item,
            template: display,
            text,
          })),
        ),
      ),
    );
  });
  yield* failWhenAny(failed);
  return resolved;
});

const decodeEntries = Effect.fn("Authoring.decodeEntries")(function* (
  entries: ReadonlyArray<Entry>,
  resolved: ReadonlyArray<ResolvedTemplate>,
) {
  const templateText = new Map(
    resolved.map((item) => [
      templateFieldKey(item.entryIndex, item.contribution, item.field),
      item.text,
    ]),
  );
  const resolveInput = (entry: Entry, entryIndex: number): unknown => {
    const contributions = contributionsOf(entry);
    return contributions && Predicate.isObject(entry.input)
      ? {
          ...entry.input,
          contributions: contributions.map((contribution, index) =>
            Predicate.isObject(contribution)
              ? Object.fromEntries(
                  fieldsOf(contribution).map(([field, value]) => [
                    field,
                    isTemplateRef(value)
                      ? templateText.get(
                          templateFieldKey(entryIndex, index, field),
                        )
                      : value,
                  ]),
                )
              : contribution,
          ),
        }
      : entry.input;
  };
  const options = { onExcessProperty: "error", errors: "all" } as const;
  const [invalid, decoded] = yield* Effect.partition(
    entries.map((entry, index) => [entry, index] as const),
    ([entry, index]): Effect.Effect<Decoded, CatalogBuildIssue> => {
      const input = resolveInput(entry, index);
      const decode: Effect.Effect<Decoded, Schema.SchemaError> =
        entry.kind === "target"
          ? Schema.decodeUnknownEffect(TargetDefinition)(input, options).pipe(
              Effect.map((target) => ({ _tag: "target", target })),
            )
          : Schema.decodeUnknownEffect(ModuleDefinition)(input, options).pipe(
              Effect.map((module) => ({ _tag: "module", module })),
            );
      return decode.pipe(
        Effect.mapError((error) => ({
          subject: entry.subject,
          code: "invalid-shape",
          message: `${catalogIssueLabel(entry.subject)} is invalid: ${error.message}`,
          sources: [entry.source],
        })),
      );
    },
  );
  yield* failWhenAny(invalid);
  return decoded;
});

const composeMessage = (issue: CatalogIssue): string =>
  issue.code === "finalize-script"
    ? `${catalogIssueLabel(issue.subject)} declares Finalize scripts, which contributed catalogs cannot ship; only an application-trusted build may pass finalizeScripts: "allow"`
    : issue.message;

/**
 * Build a deterministic v1 catalog document from authored definitions.
 *
 * Stages run in order (options and sources, templates, definition shape,
 * references, interpreter capabilities) and the build stops after the first
 * stage that reports issues.
 */
export const buildCatalog = Effect.fn("Authoring.buildCatalog")(function* (
  catalog: CatalogInput,
  options: BuildCatalogOptions,
) {
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
  const locations = yield* makeLocations(options.root);
  const entries = yield* collectEntries(catalog, locations);
  const sourcesOf = (subject: CatalogIssueSubject) =>
    Arr.dedupe(
      entries
        .filter(
          (entry) =>
            catalogIssueKey(entry.subject) === catalogIssueKey(subject),
        )
        .map((entry) => entry.source),
    );
  const resolved = yield* resolveTemplates(entries, locations);
  const decoded = yield* decodeEntries(entries, resolved);

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
          message: composeMessage(issue),
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
                : `${catalogIssueLabel(subject)} uses unsupported capability ${capability}`,
            sources: sourcesOf(subject),
          };
          const owned = (item: { readonly subject: CatalogIssueSubject }) =>
            catalogIssueKey(item.subject) === catalogIssueKey(subject);
          const templates = resolved
            .filter((item) => owned(item.entry))
            .filter((item) =>
              templateCapabilities(item.text).includes(capability),
            )
            .map((item) => ({ ...issue, template: item.template }));
          const inline = entries
            .filter(owned)
            .some((entry) =>
              inlineStrings(entry.input)
                .flatMap(templateCapabilities)
                .includes(capability),
            );
          return inline || templates.length === 0
            ? [issue, ...templates]
            : templates;
        }),
      ),
    ),
  );

  const json = yield* Schema.encodeEffect(
    Schema.fromJsonString(CatalogDocument),
  )(document).pipe(Effect.orDie);
  const provenance = entries.map((entry, entryIndex): DefinitionProvenance => {
    const definition = Option.fromNullishOr(decoded[entryIndex]).pipe(
      Option.map((item) =>
        item._tag === "target" ? item.target : item.module,
      ),
    );
    return {
      subject: entry.subject,
      source: entry.source,
      templates: resolved
        .filter((item) => item.entryIndex === entryIndex)
        .flatMap((item) =>
          Option.match(
            Option.flatMap(definition, (value) =>
              Option.fromNullishOr(value.contributions[item.contribution]),
            ),
            {
              onNone: () => [],
              onSome: (contribution) => [
                {
                  contribution: item.contribution,
                  field: item.field,
                  contributionPath:
                    contribution._tag === "barrel-export"
                      ? contribution.barrelPath
                      : contribution.path,
                  template: item.template,
                },
              ],
            },
          ),
        ),
    };
  });
  return {
    json: `${json}\n`,
    document,
    provenance,
  } satisfies BuildCatalogResult;
});
