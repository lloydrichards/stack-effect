import {
  type CatalogCapabilityIssue,
  CatalogCapabilityError,
  CatalogDocument,
  type CatalogFragment,
  type ModuleDefinition,
  type TargetDefinition,
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
  "target:hierarchical-name",
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

type Definition = typeof TargetDefinition.Type | typeof ModuleDefinition.Type;

const definitionHierarchicalNameCapabilities = (
  definition: Definition,
): ReadonlyArray<string> => {
  const names =
    "supportedOn" in definition
      ? [
          ...definition.supportedOn.flatMap((rule) =>
            rule._tag === "identity" ? [rule.identity.name] : [],
          ),
          ...definition.dependencies.map((dependency) =>
            dependency._tag === "required-target"
              ? dependency.identity.name
              : dependency.target.name,
          ),
        ]
      : [definition.defaultName ?? ""];
  return names.some((name) => name.includes("/"))
    ? ["target:hierarchical-name"]
    : [];
};

/** Capabilities required by structured target names, excluding template text. */
export const hierarchicalNameCapabilities = (
  fragment: CatalogFragment,
): ReadonlyArray<string> =>
  Arr.dedupe(
    [...fragment.targets, ...fragment.modules].flatMap(
      definitionHierarchicalNameCapabilities,
    ),
  );

const definitionCapabilities = (definition: Definition): ReadonlySet<string> =>
  new Set([
    ...definition.contributions.map(
      (contribution) => `contribution:${contribution._tag}`,
    ),
    ...definitionHierarchicalNameCapabilities(definition),
    ...stringsIn(definition).flatMap(templateCapabilities),
  ]);

const capabilitiesUsedBy = (document: CatalogDocument): ReadonlyArray<string> =>
  Arr.dedupe(
    [...document.targets, ...document.modules].flatMap((definition) => [
      ...definitionCapabilities(definition),
    ]),
  );

/** Reject unsupported operations and undeclared capabilities used by definitions. */
export const validateCatalogCapabilities = Effect.fn(
  "Catalog.validateCapabilities",
)(function* (
  document: CatalogDocument,
  interpreterCapabilities: ReadonlyArray<string> = V1_INTERPRETER_CAPABILITIES,
) {
  const supported = new Set(interpreterCapabilities);
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
