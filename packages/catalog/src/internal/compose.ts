import {
  CatalogFragment,
  CatalogDocument,
  type CatalogIssue,
  type CatalogIssueCode,
  CatalogIssueSubject,
  CatalogValidationError,
  type ModuleDefinition,
  type ModuleId,
  ModuleDependency,
  type SupportedOn,
  type TargetIdentity,
  catalogIssueLabel,
  duplicates,
} from "@repo/domain/Catalog";
import { Array as Arr, Effect, Schema } from "effect";
import type { ComposeOptions, FragmentSource } from "../Catalog";
import { dependencyTarget, supportedOnTargetKind } from "./definitionTargets";

type Fragment = CatalogFragment | CatalogDocument;

// The definition that owns an issue, and the fragment it came from.
type Owner = {
  subject: CatalogIssueSubject;
  fragment: number;
};

const fragmentIndex = (ids: ReadonlyArray<ReadonlyArray<string>>) =>
  new Map(
    ids
      .flatMap((fragmentIds, index) =>
        fragmentIds.map((id) => [id, index] as const),
      )
      .toReversed(),
  );

const composition = (
  decoded: ReadonlyArray<Fragment>,
  sources: ReadonlyArray<FragmentSource> | undefined,
) => {
  // Each definition keeps its own fragment, so a duplicate ID keeps its own source.
  const targetEntries = decoded.flatMap((fragment, index) =>
    fragment.targets.map((target) => ({ target, fragment: index })),
  );
  const moduleEntries = decoded.flatMap((fragment, index) =>
    fragment.modules.map((module) => ({ module, fragment: index })),
  );
  return {
    sources,
    targetEntries,
    moduleEntries,
    targetFragment: fragmentIndex(
      decoded.map((fragment) => fragment.targets.map((target) => target.kind)),
    ),
    moduleFragment: fragmentIndex(
      decoded.map((fragment) => fragment.modules.map((module) => module.id)),
    ),
    moduleById: new Map(
      moduleEntries.map(({ module }) => [module.id, module] as const),
    ),
  };
};

type Composition = ReturnType<typeof composition>;

const sourceLabel = (context: Composition, index: number | undefined) =>
  index === undefined
    ? ""
    : (context.sources?.[index]?.name ?? `fragment ${index}`);

/** Whether a definition from `owner` may reference one from `referenced`. */
const canReference = (
  context: Composition,
  owner: number,
  referenced: number | undefined,
) =>
  context.sources === undefined ||
  referenced === undefined ||
  owner === referenced ||
  (context.sources[owner]?.requires ?? []).includes(
    sourceLabel(context, referenced),
  );

const issue = (
  owner: Owner,
  code: CatalogIssueCode,
  message: string,
): CatalogIssue => ({
  subject: owner.subject,
  code,
  message,
  fragment: owner.fragment,
});

const sourced = (context: Composition, located: CatalogIssue): CatalogIssue =>
  context.sources === undefined
    ? located
    : {
        ...located,
        message: `Source ${sourceLabel(context, located.fragment)}: ${located.message}`,
      };

const sourceIssues = (
  sources: ReadonlyArray<FragmentSource>,
): ReadonlyArray<CatalogIssue> =>
  sources.flatMap((source, index) =>
    source.requires.flatMap((name): ReadonlyArray<CatalogIssue> => {
      if (name === source.name)
        return [
          {
            subject: CatalogIssueSubject.cases.document.make({}),
            code: "invalid-shape",
            message: `Source ${source.name} cannot require itself`,
            fragment: index,
          },
        ];
      if (sources.some((other) => other.name === name)) return [];
      return [
        {
          subject: CatalogIssueSubject.cases.document.make({}),
          code: "missing-source",
          message: `Source ${source.name} requires the ${name} catalog, which is not selected; select it with --catalog ${name}`,
          fragment: index,
        },
      ];
    }),
  );

const inSources = (context: Composition, fragments: ReadonlyArray<number>) =>
  context.sources === undefined
    ? ""
    : ` in sources ${Arr.dedupe(fragments.map((index) => sourceLabel(context, index))).join(" and ")}`;

const duplicateIssues = (context: Composition): ReadonlyArray<CatalogIssue> => [
  ...duplicates(context.targetEntries.map(({ target }) => target.kind)).map(
    (kind): CatalogIssue => ({
      subject: CatalogIssueSubject.cases.target.make({ kind }),
      code: "duplicate-id",
      message: `Duplicate target kind ${kind}${inSources(
        context,
        context.targetEntries
          .filter(({ target }) => target.kind === kind)
          .map(({ fragment }) => fragment),
      )}`,
    }),
  ),
  ...duplicates(context.moduleEntries.map(({ module }) => module.id)).map(
    (id): CatalogIssue => ({
      subject: CatalogIssueSubject.cases.module.make({ id }),
      code: "duplicate-id",
      message: `Duplicate module ID ${id}${inSources(
        context,
        context.moduleEntries
          .filter(({ module }) => module.id === id)
          .map(({ fragment }) => fragment),
      )}`,
    }),
  ),
];

const undeclaredIssues = (
  context: Composition,
  owner: Owner,
  referenced: number | undefined,
  description: string,
): ReadonlyArray<CatalogIssue> =>
  canReference(context, owner.fragment, referenced)
    ? []
    : [
        issue(
          owner,
          "undeclared-reference",
          `${catalogIssueLabel(owner.subject)} references ${description} from source ${sourceLabel(context, referenced)} without declaring requires: ["${sourceLabel(context, referenced)}"]`,
        ),
      ];

const targetReferenceIssues = (
  context: Composition,
  owner: Owner,
  kind: string,
): ReadonlyArray<CatalogIssue> => [
  ...(context.targetFragment.has(kind)
    ? []
    : [
        issue(
          owner,
          "missing-reference",
          `${catalogIssueLabel(owner.subject)} references missing target ${kind}`,
        ),
      ]),
  ...undeclaredIssues(
    context,
    owner,
    context.targetFragment.get(kind),
    `target ${kind}`,
  ),
];

const moduleReferenceIssues = (
  context: Composition,
  owner: Owner,
  id: ModuleId,
): ReadonlyArray<CatalogIssue> => [
  ...(context.moduleById.has(id)
    ? []
    : [
        issue(
          owner,
          "missing-reference",
          `${catalogIssueLabel(owner.subject)} references missing module ${id}`,
        ),
      ]),
  ...undeclaredIssues(
    context,
    owner,
    context.moduleFragment.get(id),
    `module ${id}`,
  ),
];

const supportsKind = (module: ModuleDefinition, kind: string) =>
  module.supportedOn.some((rule) => rule._tag === "kind" && rule.kind === kind);

const rulesOverlap = (rule: SupportedOn, other: SupportedOn) =>
  rule._tag === "identity" && other._tag === "identity"
    ? rule.identity.kind === other.identity.kind &&
      rule.identity.toKey() === other.identity.toKey()
    : supportedOnTargetKind(rule) === supportedOnTargetKind(other);

const targetIssues = (
  context: Composition,
  entry: Composition["targetEntries"][number],
): ReadonlyArray<CatalogIssue> => {
  const { target } = entry;
  const owner: Owner = {
    subject: CatalogIssueSubject.cases.target.make({ kind: target.kind }),
    fragment: entry.fragment,
  };
  return (target.requiredModules ?? []).flatMap((id) => {
    const required = context.moduleById.get(id);
    return [
      ...moduleReferenceIssues(context, owner, id),
      ...(required && !supportsKind(required, target.kind)
        ? [
            issue(
              owner,
              "unsupported-target",
              `Target ${target.kind} requires module ${id} on another target`,
            ),
          ]
        : []),
    ];
  });
};

const dependencyOwner = (context: Composition, identity: TargetIdentity) =>
  identity.placeCatalogReference(
    context.targetEntries.find(({ target }) => target.kind === identity.kind)
      ?.target.defaultName,
  );

const requiredModuleIssues = (
  context: Composition,
  owner: Owner,
  module: ModuleDefinition,
  dependency: Extract<ModuleDependency, { _tag: "required-module" }>,
): ReadonlyArray<CatalogIssue> => {
  const required = context.moduleById.get(dependency.moduleId);
  const target = dependencyOwner(context, dependency.target);
  return [
    ...moduleReferenceIssues(context, owner, dependency.moduleId),
    ...(required && !required.supportedOn.some((rule) => target.matches(rule))
      ? [
          issue(
            owner,
            "unsupported-target",
            `Module ${module.id} requires ${dependency.moduleId} on an unsupported target`,
          ),
        ]
      : []),
  ];
};

const capabilityIssues = (
  context: Composition,
  owner: Owner,
  module: ModuleDefinition,
  dependency: Extract<ModuleDependency, { _tag: "required-capability" }>,
): ReadonlyArray<CatalogIssue> => {
  const target = dependencyOwner(context, dependency.target);
  return context.moduleEntries.some(
    (candidate) =>
      candidate.module.provides?.includes(dependency.capability) &&
      candidate.module.supportedOn.some((rule) => target.matches(rule)) &&
      canReference(context, owner.fragment, candidate.fragment),
  )
    ? []
    : [
        issue(
          owner,
          "unavailable-capability",
          `Module ${module.id} requires unavailable capability ${dependency.capability}`,
        ),
      ];
};

const dependencyIssues = (
  context: Composition,
  owner: Owner,
  module: ModuleDefinition,
): ReadonlyArray<CatalogIssue> =>
  module.dependencies.flatMap((dependency) => [
    ...targetReferenceIssues(context, owner, dependencyTarget(dependency).kind),
    ...ModuleDependency.match(dependency, {
      "required-target": () => [],
      "required-module": (required) =>
        requiredModuleIssues(context, owner, module, required),
      "required-capability": (required) =>
        capabilityIssues(context, owner, module, required),
    }),
  ]);

const implicationIssues = (
  context: Composition,
  owner: Owner,
  module: ModuleDefinition,
): ReadonlyArray<CatalogIssue> =>
  (module.implies ?? []).flatMap((implication) => {
    const implied = context.moduleById.get(implication.moduleId);
    return [
      ...targetReferenceIssues(context, owner, implication.targetKind),
      ...moduleReferenceIssues(context, owner, implication.moduleId),
      ...(implied && !supportsKind(implied, implication.targetKind)
        ? [
            issue(
              owner,
              "unsupported-target",
              `Module ${module.id} implies ${implication.moduleId} on an unsupported target`,
            ),
          ]
        : []),
    ];
  });

const childIssues = (
  context: Composition,
  owner: Owner,
  module: ModuleDefinition,
): ReadonlyArray<CatalogIssue> =>
  (module.children ?? []).flatMap((child) => {
    const definition = context.moduleById.get(child.moduleId);
    return [
      ...moduleReferenceIssues(context, owner, child.moduleId),
      ...(definition &&
      !module.supportedOn.some((rule) =>
        definition.supportedOn.some((other) => rulesOverlap(rule, other)),
      )
        ? [
            issue(
              owner,
              "unsupported-target",
              `Module ${module.id} has child ${child.moduleId} on another target`,
            ),
          ]
        : []),
    ];
  });

const conflictIssues = (
  context: Composition,
  owner: Owner,
  module: ModuleDefinition,
): ReadonlyArray<CatalogIssue> =>
  (module.conflictsWith ?? []).flatMap((conflict) => {
    const conflictFragment = context.moduleFragment.get(conflict);
    // Conflicts are symmetric, and another source cannot edit its side.
    if (
      context.sources !== undefined &&
      conflictFragment !== undefined &&
      conflictFragment !== owner.fragment
    )
      return [
        issue(
          owner,
          "cross-source-conflict",
          `Module ${module.id} conflicts with ${conflict} from source ${sourceLabel(context, conflictFragment)}; conflicts must stay within one source`,
        ),
      ];
    const other = context.moduleById.get(conflict);
    return [
      ...moduleReferenceIssues(context, owner, conflict),
      ...(other && !other.conflictsWith?.includes(module.id)
        ? [
            issue(
              owner,
              "asymmetric-conflict",
              `Module ${module.id} has asymmetric conflict with ${conflict}`,
            ),
          ]
        : []),
    ];
  });

const moduleIssues = (
  context: Composition,
  entry: Composition["moduleEntries"][number],
): ReadonlyArray<CatalogIssue> => {
  const { module } = entry;
  const owner: Owner = {
    subject: CatalogIssueSubject.cases.module.make({ id: module.id }),
    fragment: entry.fragment,
  };
  return [
    ...module.supportedOn.flatMap((rule) =>
      targetReferenceIssues(context, owner, supportedOnTargetKind(rule)),
    ),
    ...dependencyIssues(context, owner, module),
    ...implicationIssues(context, owner, module),
    ...childIssues(context, owner, module),
    ...conflictIssues(context, owner, module),
  ];
};

const finalizeScriptIssues = (
  decoded: ReadonlyArray<Fragment>,
  options: ComposeOptions,
): ReadonlyArray<CatalogIssue> =>
  options.allowFinalizeScripts
    ? []
    : decoded.flatMap((fragment, index): ReadonlyArray<CatalogIssue> =>
        index === options.trustedFragmentIndex
          ? []
          : [
              ...fragment.targets
                .filter((target) => target.scripts?.length)
                .map((target): CatalogIssue => ({
                  subject: CatalogIssueSubject.cases.target.make({
                    kind: target.kind,
                  }),
                  code: "finalize-script",
                  message: `Fragment ${index} target ${target.kind} contains Finalize scripts`,
                  fragment: index,
                })),
              ...fragment.modules
                .filter((module) => module.scripts?.length)
                .map((module): CatalogIssue => ({
                  subject: CatalogIssueSubject.cases.module.make({
                    id: module.id,
                  }),
                  code: "finalize-script",
                  message: `Fragment ${index} module ${module.id} contains Finalize scripts`,
                  fragment: index,
                })),
            ],
      );

const origins = (
  context: Composition,
  sources: ReadonlyArray<FragmentSource>,
) => ({
  targets: new Map(
    [...context.targetFragment].map(([kind, index]) => [
      kind,
      sourceLabel(context, index),
    ]),
  ),
  modules: new Map(
    [...context.moduleFragment].map(([id, index]) => [
      id,
      sourceLabel(context, index),
    ]),
  ),
  requires: new Map(sources.map((source) => [source.name, source.requires])),
});

/** @internal */
export const compose = Effect.fn("Catalog.compose")(function* (
  fragments: ReadonlyArray<unknown>,
  options: ComposeOptions = {},
) {
  const decoded = yield* Effect.forEach(fragments, (fragment, index) =>
    Schema.decodeUnknownEffect(
      Schema.Union([CatalogFragment, CatalogDocument]),
    )(fragment, { onExcessProperty: "error" }).pipe(
      Effect.mapError(
        (error) =>
          new CatalogValidationError({
            details: [
              {
                subject: CatalogIssueSubject.cases.document.make({}),
                code: "invalid-shape",
                message: `Fragment ${index}: ${error.message}`,
                fragment: index,
              },
            ],
          }),
      ),
    ),
  );
  const { sources } = options;

  // Dependencies between sources are checked first: a missing source would
  // otherwise surface as a cascade of missing references.
  const unresolvedSources = sourceIssues(sources ?? []);
  if (unresolvedSources.length > 0)
    return yield* new CatalogValidationError({ details: unresolvedSources });

  const context = composition(decoded, sources);
  const issues = [
    ...duplicateIssues(context),
    ...[
      ...context.targetEntries.flatMap((entry) => targetIssues(context, entry)),
      ...context.moduleEntries.flatMap((entry) => moduleIssues(context, entry)),
    ].map((located) => sourced(context, located)),
    ...finalizeScriptIssues(decoded, options),
  ];
  if (issues.length > 0)
    return yield* new CatalogValidationError({ details: issues });

  return {
    targets: context.targetEntries.map(({ target }) => target),
    modules: context.moduleEntries.map(({ module }) => module),
    origins: sources === undefined ? undefined : origins(context, sources),
  };
});
