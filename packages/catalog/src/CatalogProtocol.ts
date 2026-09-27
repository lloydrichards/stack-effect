import { CatalogCapabilityError, CatalogDocument } from "@repo/domain/Catalog";
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

const capabilitiesUsedBy = (
  document: CatalogDocument,
): ReadonlyArray<string> => {
  const contributions = [
    ...document.targets.flatMap((target) => target.contributions),
    ...document.modules.flatMap((module) => module.contributions),
  ];
  const stringsIn = (value: unknown): ReadonlyArray<string> =>
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(stringsIn)
        : typeof value === "object" && value !== null
          ? Object.values(value).flatMap(stringsIn)
          : [];
  const templateCapabilities = (text: string): ReadonlyArray<string> => {
    const tokens = [...text.matchAll(/\{\{([^{}]+)\}\}/g)];
    const syntax =
      (text.match(/\{\{/g)?.length ?? 0) === tokens.length
        ? []
        : ["syntax:malformed-template"];
    let inConditional = false;
    const parsedTokens = tokens.flatMap((match) => {
      const raw = match[1];
      if (raw === undefined) return ["syntax:malformed-template"];
      if (raw === "/if") {
        if (!inConditional) return ["syntax:malformed-template"];
        inConditional = false;
        return [];
      }
      if (raw.startsWith("#if")) {
        const condition = /^#if\s+(\w+)(?:=([\w-]+))?$/.exec(raw);
        if (condition === null || inConditional)
          return ["syntax:malformed-template"];
        inConditional = true;
        return [`condition:${condition[1]}`];
      }
      return [`token:${raw}`];
    });
    return [
      ...parsedTokens,
      ...syntax,
      ...(inConditional ? ["syntax:malformed-template"] : []),
    ];
  };
  return Arr.dedupe([
    ...contributions.map((contribution) => `contribution:${contribution._tag}`),
    ...stringsIn({
      targets: document.targets,
      modules: document.modules,
    }).flatMap(templateCapabilities),
  ]);
};

/** Reject documents that need an interpreter operation outside the fixed v1 set. */
export const validateCatalogCapabilities = Effect.fn(
  "Catalog.validateCapabilities",
)(function* (document: CatalogDocument) {
  const supported = new Set(V1_INTERPRETER_CAPABILITIES);
  const declared = new Set(document.requiredCapabilities);
  const invalid = Arr.dedupe([
    ...document.requiredCapabilities.filter(
      (capability) => !supported.has(capability),
    ),
    ...capabilitiesUsedBy(document).filter(
      (capability) => !supported.has(capability) || !declared.has(capability),
    ),
  ]);
  if (invalid.length > 0)
    return yield* new CatalogCapabilityError({ capabilities: invalid });
  return document;
});

/** Validate one source without requiring its references to resolve yet. */
export const decodeCatalogDocument = (input: unknown) =>
  Schema.decodeUnknownEffect(CatalogDocument)(input, {
    onExcessProperty: "error",
  }).pipe(Effect.flatMap(validateCatalogCapabilities));
