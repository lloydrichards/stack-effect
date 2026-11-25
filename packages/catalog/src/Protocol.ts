/**
 * The v1 catalog wire format: decode a catalog document and check the
 * interpreter capabilities its definitions use.
 */
import {
  CatalogCapabilityIssue,
  CatalogCapabilityError,
  CatalogDocument,
  type CatalogFragment,
  type CatalogDefinition,
  CatalogIssueSubject,
} from "@repo/domain/Catalog";
import { Array as Arr, Effect, Predicate, Schema } from "effect";
import { dependencyTarget } from "./internal/definitionTargets";

const contributionTags = [
  "file",
  "pkg-json-entry",
  "ts-call-arg",
  "ts-object-field",
  "jsx-slot",
] as const;

const tokenNames = [
  "projectName",
  "scaffoldRecipe",
  "runCommand",
  "workspaceTargets",
  "projectRoot",
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
  "module",
  "hasApps",
  "noModule",
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
  "contribution:compiled-package-export",
];

const stringsIn = (value: unknown): ReadonlyArray<string> => {
  if (Predicate.isString(value)) return [value];
  if (Predicate.isObjectOrArray(value))
    return Object.values(value).flatMap(stringsIn);
  return [];
};

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

const definitionHierarchicalNameCapabilities = (
  definition: CatalogDefinition,
): ReadonlyArray<string> => {
  const names =
    "supportedOn" in definition
      ? [
          ...definition.supportedOn.flatMap((rule) =>
            rule._tag === "identity" ? [rule.identity.name] : [],
          ),
          ...definition.dependencies.map(
            (dependency) => dependencyTarget(dependency).name,
          ),
        ]
      : [definition.defaultName ?? ""];
  return names.some((name) => name.includes("/"))
    ? ["target:hierarchical-name"]
    : [];
};

const compiledPackageExportCapability = (definition: CatalogDefinition) =>
  definition.contributions.some(
    (contribution) =>
      contribution._tag === "pkg-json-entry" &&
      contribution.compiledValue !== undefined,
  )
    ? ["contribution:compiled-package-export"]
    : [];

/** Capabilities required by structured contributions and target names. */
export const structuredCapabilities = (fragment: CatalogFragment) =>
  Arr.dedupe(
    [...fragment.targets, ...fragment.modules].flatMap((definition) => [
      ...definitionHierarchicalNameCapabilities(definition),
      ...compiledPackageExportCapability(definition),
    ]),
  );

const definitionCapabilities = (
  definition: CatalogDefinition,
): ReadonlySet<string> =>
  new Set([
    ...definition.contributions.map(
      (contribution) => `contribution:${contribution._tag}`,
    ),
    ...definitionHierarchicalNameCapabilities(definition),
    ...compiledPackageExportCapability(definition),
    ...stringsIn(definition).flatMap(templateCapabilities),
  ]);

const capabilitiesUsedBy = (document: CatalogDocument): ReadonlyArray<string> =>
  Arr.dedupe(
    [...document.targets, ...document.modules].flatMap((definition) => [
      ...definitionCapabilities(definition),
    ]),
  );

/** Reject unsupported operations and undeclared capabilities used by definitions. */
export const validateCapabilities = Effect.fn("Catalog.validateCapabilities")(
  function* (
    document: CatalogDocument,
    interpreterCapabilities: ReadonlyArray<string> = V1_INTERPRETER_CAPABILITIES,
  ) {
    const supported = new Set(interpreterCapabilities);
    const declared = new Set(document.requiredCapabilities);
    const documentSubject = CatalogIssueSubject.cases.document.make({});
    const users = [
      ...document.targets.map((target) => ({
        subject: CatalogIssueSubject.cases.target.make({ kind: target.kind }),
        capabilities: definitionCapabilities(target),
      })),
      ...document.modules.map((module) => ({
        subject: CatalogIssueSubject.cases.module.make({ id: module.id }),
        capabilities: definitionCapabilities(module),
      })),
    ];
    const details = [
      ...document.requiredCapabilities
        .filter((capability) => !supported.has(capability))
        .map((capability) =>
          CatalogCapabilityIssue.make({ subject: documentSubject, capability }),
        ),
      ...capabilitiesUsedBy(document)
        .filter(
          (capability) =>
            !supported.has(capability) || !declared.has(capability),
        )
        .flatMap((capability) =>
          users
            .filter((user) => user.capabilities.has(capability))
            .map(({ subject }) =>
              CatalogCapabilityIssue.make({ subject, capability }),
            ),
        ),
    ];
    if (details.length > 0)
      return yield* new CatalogCapabilityError({ details });
    return document;
  },
);

/** Validate one source without requiring its references to resolve yet. */
export const decodeDocument = (input: unknown) =>
  Schema.decodeUnknownEffect(CatalogDocument)(input, {
    onExcessProperty: "error",
  }).pipe(Effect.flatMap(validateCapabilities));
