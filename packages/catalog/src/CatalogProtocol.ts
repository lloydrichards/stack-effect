import {
  type CatalogCapabilityIssue,
  CatalogCapabilityError,
  CatalogDocument,
  type CatalogIssueSubject,
} from "@repo/domain/Catalog";
import { Array as Arr, Effect, Schema } from "effect";

const contributionTags = [
  "file",
  "pkg-json-entry",
  "barrel-export",
  "ts-call-arg",
  "ts-object-field",
  "jsx-slot",
] as const;

const tokenNames = [
  "projectName",
  "runtime",
  "packageManager",
  "packageManagerSpec",
  "typescript",
  "workspaceDependency",
  "lint",
  "format",
  "test",
  "monorepo",
  "targetKind",
  "targetName",
  "targetPath",
  "targetDir",
  "packageName",
] as const;

const conditionalNames = [
  "runtime",
  "packageManager",
  "typescript",
  "lint",
  "format",
  "test",
  "monorepo",
  "noMonorepo",
  "effectOxlint",
  "standaloneOxlint",
  "standaloneEffectOxlint",
  "typescript7Diagnostics",
] as const;

export const V1_INTERPRETER_CAPABILITIES: ReadonlyArray<string> = [
  ...contributionTags.map((tag) => `contribution:${tag}`),
  ...tokenNames.map((name) => `token:${name}`),
  ...conditionalNames.map((name) => `condition:${name}`),
];

const stringsIn = (value: unknown): ReadonlyArray<string> =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(stringsIn)
      : typeof value === "object" && value !== null
        ? Object.values(value).flatMap(stringsIn)
        : [];

/** Interpreter capabilities one template string needs, including syntax faults. */
export const templateCapabilities = (text: string): ReadonlyArray<string> => {
  const tokens = [...text.matchAll(/\{\{([^{}]+)\}\}/g)];
  const syntax =
    (text.match(/\{\{/g)?.length ?? 0) === tokens.length
      ? []
      : ["syntax:malformed-template"];
  const [unclosed, parsedTokens] = Arr.mapAccum(
    tokens,
    false,
    (inConditional, match): [boolean, ReadonlyArray<string>] => {
      const raw = match[1];
      if (raw === undefined)
        return [inConditional, ["syntax:malformed-template"]];
      if (raw === "/if")
        return inConditional
          ? [false, []]
          : [false, ["syntax:malformed-template"]];
      if (raw.startsWith("#if")) {
        const condition = /^#if\s+(\w+)(?:=([\w-]+))?$/.exec(raw);
        return condition === null || inConditional
          ? [inConditional, ["syntax:malformed-template"]]
          : [true, [`condition:${condition[1]}`]];
      }
      return [inConditional, [`token:${raw}`]];
    },
  );
  return [
    ...parsedTokens.flat(),
    ...syntax,
    ...(unclosed ? ["syntax:malformed-template"] : []),
  ];
};

const capabilitiesUsedBy = (
  document: CatalogDocument,
): ReadonlyArray<string> => {
  const contributions = [
    ...document.targets.flatMap((target) => target.contributions),
    ...document.modules.flatMap((module) => module.contributions),
  ];
  return Arr.dedupe([
    ...contributions.map((contribution) => `contribution:${contribution._tag}`),
    ...stringsIn({
      targets: document.targets,
      modules: document.modules,
    }).flatMap(templateCapabilities),
  ]);
};

const definitionCapabilities = (definition: {
  readonly contributions: ReadonlyArray<{ readonly _tag: string }>;
}): ReadonlySet<string> =>
  new Set([
    ...definition.contributions.map(
      (contribution) => `contribution:${contribution._tag}`,
    ),
    ...stringsIn(definition).flatMap(templateCapabilities),
  ]);

/** Reject documents that need an interpreter operation outside the fixed v1 set. */
export const validateCatalogCapabilities = Effect.fn(
  "Catalog.validateCapabilities",
)(function* (document: CatalogDocument) {
  const supported = new Set(V1_INTERPRETER_CAPABILITIES);
  const declared = new Set(document.requiredCapabilities);
  const documentSubject: CatalogIssueSubject = { _tag: "document" };
  const users: ReadonlyArray<{
    readonly subject: CatalogIssueSubject;
    readonly capabilities: ReadonlySet<string>;
  }> = [
    ...document.targets.map((target) => ({
      subject: { _tag: "target", kind: target.kind } as const,
      capabilities: definitionCapabilities(target),
    })),
    ...document.modules.map((module) => ({
      subject: { _tag: "module", id: module.id } as const,
      capabilities: definitionCapabilities(module),
    })),
  ];
  const details: ReadonlyArray<CatalogCapabilityIssue> = [
    ...document.requiredCapabilities
      .filter((capability) => !supported.has(capability))
      .map((capability) => ({ subject: documentSubject, capability })),
    ...capabilitiesUsedBy(document)
      .filter(
        (capability) => !supported.has(capability) || !declared.has(capability),
      )
      .flatMap((capability) =>
        users
          .filter((user) => user.capabilities.has(capability))
          .map(({ subject }) => ({ subject, capability })),
      ),
  ];
  if (details.length > 0) return yield* new CatalogCapabilityError({ details });
  return document;
});

/** Validate one source without requiring its references to resolve yet. */
export const decodeCatalogDocument = (input: unknown) =>
  Schema.decodeUnknownEffect(CatalogDocument)(input, {
    onExcessProperty: "error",
  }).pipe(Effect.flatMap(validateCatalogCapabilities));
