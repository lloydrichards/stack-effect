import { Option, Schema } from "effect";

const TrimmedNonEmptyString = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isTrimmed(),
);

const TargetKind = Schema.Union([
  Schema.Literal("app"),
  Schema.Literal("package"),
]);

export const TargetIdentity = Schema.Struct({
  kind: TargetKind,
  name: TrimmedNonEmptyString,
});
export type TargetIdentity = Schema.Schema.Type<typeof TargetIdentity>;

export const RepoModule = TrimmedNonEmptyString;
export type RepoModule = Schema.Schema.Type<typeof RepoModule>;

export const TargetModuleId = Schema.Literal("domain-api");
export type TargetModuleId = Schema.Schema.Type<typeof TargetModuleId>;

export const TargetReference = Schema.Struct({
  targetId: TrimmedNonEmptyString,
});
export type TargetReference = Schema.Schema.Type<typeof TargetReference>;

export const TargetModuleSelection = Schema.Struct({
  moduleId: TargetModuleId,
});
export type TargetModuleSelection = Schema.Schema.Type<
  typeof TargetModuleSelection
>;

export const TargetSelection = Schema.Struct({
  targetId: TrimmedNonEmptyString,
  targetModules: Schema.Array(TargetModuleSelection),
});
export type TargetSelection = Schema.Schema.Type<typeof TargetSelection>;

export const TargetModuleReference = Schema.Struct({
  targetId: TrimmedNonEmptyString,
  moduleId: TargetModuleId,
});
export type TargetModuleReference = Schema.Schema.Type<
  typeof TargetModuleReference
>;

export const Selection = Schema.Struct({
  targets: Schema.Array(TargetSelection),
  repoModules: Schema.Array(RepoModule),
});
export type Selection = Schema.Schema.Type<typeof Selection>;

export const BlueprintNodeReference = Schema.Union([
  Schema.TaggedStruct("target", {
    targetId: TrimmedNonEmptyString,
  }),
  Schema.TaggedStruct("repo-module", {
    moduleId: RepoModule,
  }),
  Schema.TaggedStruct("target-module", {
    targetId: TrimmedNonEmptyString,
    moduleId: TargetModuleId,
  }),
]);
export type BlueprintNodeReference = Schema.Schema.Type<
  typeof BlueprintNodeReference
>;

export const BlueprintCause = Schema.Union([
  Schema.TaggedStruct("selection", {
    source: BlueprintNodeReference,
  }),
  Schema.TaggedStruct("dependency", {
    edgeId: TrimmedNonEmptyString,
  }),
]);
export type BlueprintCause = Schema.Schema.Type<typeof BlueprintCause>;

export const BlueprintStatus = Schema.Union([
  Schema.Literal("selected"),
  Schema.Literal("implied"),
]);
export type BlueprintStatus = Schema.Schema.Type<typeof BlueprintStatus>;

export const PackagePublicEntrypoint = Schema.Union([
  Schema.Literal("."),
  Schema.Literal("./Api"),
]);
export type PackagePublicEntrypoint = Schema.Schema.Type<
  typeof PackagePublicEntrypoint
>;

export const TargetComposition = Schema.Union([
  Schema.TaggedStruct("package", {
    publicEntrypoint: PackagePublicEntrypoint,
  }),
]);
export type TargetComposition = Schema.Schema.Type<typeof TargetComposition>;

export const ResolvedTarget = Schema.Struct({
  targetId: TrimmedNonEmptyString,
  identity: TargetIdentity,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
  targetModules: Schema.Array(
    Schema.Struct({
      moduleId: TargetModuleId,
      status: BlueprintStatus,
      causes: Schema.NonEmptyArray(BlueprintCause),
    }),
  ),
  composition: Schema.optional(TargetComposition),
});
export type ResolvedTarget = Schema.Schema.Type<typeof ResolvedTarget>;

export const ResolvedRepoModule = Schema.Struct({
  moduleId: RepoModule,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});
export type ResolvedRepoModule = Schema.Schema.Type<typeof ResolvedRepoModule>;

export const ResolvedTargetModule = Schema.Struct({
  moduleId: TargetModuleId,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});
export type ResolvedTargetModule = Schema.Schema.Type<
  typeof ResolvedTargetModule
>;

export const BlueprintEdgeReason = Schema.Union([
  Schema.Literal("required-owning-target"),
  Schema.Literal("required-repo-module"),
  Schema.Literal("required-canonical-target"),
  Schema.Literal("required-target-module"),
]);
export type BlueprintEdgeReason = Schema.Schema.Type<typeof BlueprintEdgeReason>;

export const BlueprintDependencyEdge = Schema.TaggedStruct("depends-on", {
  edgeId: TrimmedNonEmptyString,
  from: BlueprintNodeReference,
  to: BlueprintNodeReference,
  reason: BlueprintEdgeReason,
});
export type BlueprintDependencyEdge = Schema.Schema.Type<
  typeof BlueprintDependencyEdge
>;

const BlueprintWarningEdgeIds = Schema.NonEmptyArray(TrimmedNonEmptyString);

export const BlueprintWarning = Schema.Union([
  Schema.TaggedStruct("DuplicateSelectionNormalized", {
    node: BlueprintNodeReference,
  }),
  Schema.TaggedStruct("RedundantSelectionNormalized", {
    node: BlueprintNodeReference,
    edgeIds: BlueprintWarningEdgeIds,
  }),
]);
export type BlueprintWarning = Schema.Schema.Type<typeof BlueprintWarning>;

export const Blueprint = Schema.Struct({
  targets: Schema.Array(ResolvedTarget),
  repoModules: Schema.Array(ResolvedRepoModule),
  edges: Schema.Array(BlueprintDependencyEdge),
  warnings: Schema.Array(BlueprintWarning),
});
export type Blueprint = Schema.Schema.Type<typeof Blueprint>;

export const BlueprintResolutionError = Schema.Union([
  Schema.TaggedStruct("InvalidTarget", {
    targetId: TrimmedNonEmptyString,
  }),
  Schema.TaggedStruct("InvalidTargetModuleTarget", {
    targetModule: TargetModuleReference,
  }),
  Schema.TaggedStruct("UnsupportedTargetModule", {
    targetModule: TargetModuleReference,
  }),
]);
export type BlueprintResolutionError = Schema.Schema.Type<
  typeof BlueprintResolutionError
>;

export const BlueprintResolution = Schema.Union([
  Schema.TaggedStruct("success", {
    blueprint: Blueprint,
  }),
  Schema.TaggedStruct("failure", {
    error: BlueprintResolutionError,
  }),
]);
export type BlueprintResolution = Schema.Schema.Type<
  typeof BlueprintResolution
>;

const decodeSelection = Schema.decodeUnknownOption(Selection);

const toTargetIdentity = ({
  targetId,
}: TargetReference): Option.Option<TargetIdentity> => {
  const [kind, name, ...rest] = targetId.split("/");

  if (rest.length > 0 || kind === undefined || name === undefined) {
    return Option.none();
  }

  const decodedKind = Schema.decodeUnknownOption(TargetKind)(kind);
  const decodedName = Schema.decodeUnknownOption(TrimmedNonEmptyString)(name);

  if (Option.isNone(decodedKind) || Option.isNone(decodedName)) {
    return Option.none();
  }

  return Option.some({
    kind: decodedKind.value,
    name: decodedName.value,
  });
};

export const getTargetIdentity = (
  target: TargetReference,
): Option.Option<TargetIdentity> => toTargetIdentity(target);

const toTargetId = ({ kind, name }: TargetIdentity): string =>
  `${kind}/${name}`;

const byTargetId = (
  left: { targetId: string },
  right: { targetId: string },
): number => left.targetId.localeCompare(right.targetId);

const byRepoModuleId = (
  left: { moduleId: string },
  right: { moduleId: string },
): number => left.moduleId.localeCompare(right.moduleId);

const byResolvedTargetModule = (
  left: { targetId: string; moduleId: string },
  right: { targetId: string; moduleId: string },
): number => {
  if (left.targetId === right.targetId) {
    return left.moduleId.localeCompare(right.moduleId);
  }

  return left.targetId.localeCompare(right.targetId);
};

const byNestedResolvedTargetModule = (
  left: { moduleId: string },
  right: { moduleId: string },
): number => left.moduleId.localeCompare(right.moduleId);

const toBlueprintNodeReferenceKey = (
  reference: BlueprintNodeReference,
): string => {
  switch (reference._tag) {
    case "repo-module":
      return `repo-module:${reference.moduleId}`;
    case "target":
      return `target:${reference.targetId}`;
    case "target-module":
      return `target-module:${reference.targetId}:${reference.moduleId}`;
  }
};

const byBlueprintCause = (
  left: BlueprintCause,
  right: BlueprintCause,
): number => {
  if (left._tag !== right._tag) {
    return left._tag.localeCompare(right._tag);
  }

  if (left._tag === "selection" && right._tag === "selection") {
    return toBlueprintNodeReferenceKey(left.source).localeCompare(
      toBlueprintNodeReferenceKey(right.source),
    );
  }

  if (left._tag === "dependency" && right._tag === "dependency") {
    return left.edgeId.localeCompare(right.edgeId);
  }

  return 0;
};

const byBlueprintNodeReference = (
  left: BlueprintNodeReference,
  right: BlueprintNodeReference,
): number =>
  toBlueprintNodeReferenceKey(left).localeCompare(
    toBlueprintNodeReferenceKey(right),
  );

const toBlueprintCauseKey = (cause: BlueprintCause): string => {
  switch (cause._tag) {
    case "selection":
      return `${cause._tag}:${toBlueprintNodeReferenceKey(cause.source)}`;
    case "dependency":
      return `${cause._tag}:${cause.edgeId}`;
  }
};

const toBlueprintDependencyEdgeId = ({
  from,
  to,
  reason,
}: {
  readonly from: BlueprintNodeReference;
  readonly to: BlueprintNodeReference;
  readonly reason: BlueprintEdgeReason;
}): string =>
  [reason, toBlueprintNodeReferenceKey(from), toBlueprintNodeReferenceKey(to)].join(
    "=>",
  );

const byBlueprintDependencyEdge = (
  left: BlueprintDependencyEdge,
  right: BlueprintDependencyEdge,
): number => left.edgeId.localeCompare(right.edgeId);

const toBlueprintWarningKey = (warning: BlueprintWarning): string => {
  switch (warning._tag) {
    case "DuplicateSelectionNormalized":
      return `${warning._tag}:${toBlueprintNodeReferenceKey(warning.node)}`;
    case "RedundantSelectionNormalized":
      return `${warning._tag}:${toBlueprintNodeReferenceKey(warning.node)}:${warning.edgeIds.join("|")}`;
  }
};

const byBlueprintWarning = (
  left: BlueprintWarning,
  right: BlueprintWarning,
): number =>
  toBlueprintWarningKey(left).localeCompare(toBlueprintWarningKey(right));

const selectedCause = (
  source: BlueprintNodeReference,
): readonly [BlueprintCause, ...Array<BlueprintCause>] => [
  {
    _tag: "selection",
    source,
  },
];

const dependencyCause = (edgeId: string): BlueprintCause => ({
  _tag: "dependency",
  edgeId,
});

const toDependencyEdgeIds = (
  causes: ReadonlyArray<BlueprintCause>,
): [string, ...Array<string>] | undefined => {
  const dependencyEdgeIds = new Set<string>();

  for (const cause of causes) {
    if (cause._tag === "dependency") {
      dependencyEdgeIds.add(cause.edgeId);
    }
  }

  if (dependencyEdgeIds.size === 0) {
    return undefined;
  }

  return [...dependencyEdgeIds].sort() as [string, ...Array<string>];
};

const isSupportedTargetModule = (
  targetIdentity: TargetIdentity,
  moduleId: TargetModuleId,
): boolean => {
  switch (moduleId) {
    case "domain-api":
      return (
        targetIdentity.kind === "package" && targetIdentity.name === "domain"
      );
  }
};

const requiresDomainApiTargetModule = (
  targetIdentity: TargetIdentity,
): boolean => targetIdentity.kind === "app" && targetIdentity.name === "server";

export const parseSelection = (input: unknown): Option.Option<Selection> => {
  const selection = decodeSelection(input);

  if (Option.isNone(selection)) {
    return selection;
  }

  if (
    selection.value.targets.length === 0 &&
    selection.value.repoModules.length === 0
  ) {
    return Option.none();
  }

  const targetIdentities = new Set<string>();
  const targets: Array<TargetSelection> = [];

  for (const target of selection.value.targets) {
    const targetIdentity = toTargetIdentity({ targetId: target.targetId });

    if (Option.isNone(targetIdentity)) {
      return Option.none();
    }

    const key = `${targetIdentity.value.kind}:${targetIdentity.value.name}`;

    if (targetIdentities.has(key)) {
      return Option.none();
    }

    const targetModules = new Map<string, TargetModuleSelection>();

    for (const targetModule of target.targetModules) {
      if (
        !isSupportedTargetModule(targetIdentity.value, targetModule.moduleId)
      ) {
        return Option.none();
      }

      targetModules.set(targetModule.moduleId, {
        moduleId: targetModule.moduleId,
      });
    }

    targetIdentities.add(key);
    targets.push({
      targetId: toTargetId(targetIdentity.value),
      targetModules: [...targetModules.values()].sort(byRepoModuleId),
    });
  }

  const repoModules = [...new Set(selection.value.repoModules)].sort();

  return Option.some({
    targets,
    repoModules,
  });
};

export const resolveBlueprint = (selection: Selection): BlueprintResolution => {
  const targets = new Map<string, Omit<ResolvedTarget, "targetModules">>();
  const targetIdentities = new Map<string, TargetIdentity>();
  const targetModules = new Map<
    string,
    ResolvedTargetModule & {
      targetId: string;
    }
  >();
  const edges = new Map<string, BlueprintDependencyEdge>();
  const warnings = new Map<string, BlueprintWarning>();

  const selectedTargetModules = selection.targets.flatMap((target) =>
    target.targetModules.map((targetModule) => ({
      targetId: target.targetId,
      moduleId: targetModule.moduleId,
    })),
  );

  const addWarning = (warning: BlueprintWarning): void => {
    warnings.set(toBlueprintWarningKey(warning), warning);
  };

  const addDependencyEdge = (
    from: BlueprintNodeReference,
    to: BlueprintNodeReference,
    reason: BlueprintEdgeReason,
  ): string => {
    const edge: BlueprintDependencyEdge = {
      _tag: "depends-on",
      edgeId: toBlueprintDependencyEdgeId({ from, to, reason }),
      from,
      to,
      reason,
    };

    edges.set(edge.edgeId, edge);
    return edge.edgeId;
  };

  const mergeCauses = (
    causes: ReadonlyArray<BlueprintCause>,
  ): [BlueprintCause, ...Array<BlueprintCause>] => {
    const deduped = new Map<string, BlueprintCause>();

    for (const cause of causes) {
      deduped.set(toBlueprintCauseKey(cause), cause);
    }

    return [...deduped.values()].sort(byBlueprintCause) as [
      BlueprintCause,
      ...Array<BlueprintCause>,
    ];
  };

  const upsertTarget = (
    targetId: string,
    identity: TargetIdentity,
    status: BlueprintStatus,
    causes: ReadonlyArray<BlueprintCause>,
  ): void => {
    const existingTarget = targets.get(targetId);

    if (existingTarget === undefined) {
      targets.set(targetId, {
        targetId,
        identity,
        status,
        causes: mergeCauses(causes),
      });

      return;
    }

    targets.set(targetId, {
      ...existingTarget,
      status:
        existingTarget.status === "selected" || status === "selected"
          ? "selected"
          : "implied",
      causes: mergeCauses([...existingTarget.causes, ...causes]),
    });
  };

  const upsertTargetModule = (
    targetId: string,
    moduleId: TargetModuleId,
    status: BlueprintStatus,
    causes: ReadonlyArray<BlueprintCause>,
  ): void => {
    const key = `${targetId}:${moduleId}`;
    const existingTargetModule = targetModules.get(key);

    if (existingTargetModule === undefined) {
      targetModules.set(key, {
        targetId,
        moduleId,
        status,
        causes: mergeCauses(causes),
      });

      return;
    }

    targetModules.set(key, {
      ...existingTargetModule,
      status:
        existingTargetModule.status === "selected" || status === "selected"
          ? "selected"
          : "implied",
      causes: mergeCauses([...existingTargetModule.causes, ...causes]),
    });
  };

  const resolveTargetComposition = (
    targetId: string,
    identity: TargetIdentity,
  ): TargetComposition | undefined => {
    if (identity.kind !== "package") {
      return undefined;
    }

    const domainApiKey = `${targetId}:domain-api`;

    return {
      _tag: "package",
      publicEntrypoint:
        targetId === "package/domain" && targetModules.has(domainApiKey)
          ? "./Api"
          : ".",
    };
  };

  const normalizedTargetSelections = new Set<string>();

  for (const target of selection.targets) {
    const targetIdentity = toTargetIdentity({ targetId: target.targetId });

    if (Option.isNone(targetIdentity)) {
      return {
        _tag: "failure",
        error: {
          _tag: "InvalidTarget",
          targetId: target.targetId,
        },
      };
    }

    const normalizedTargetId = toTargetId(targetIdentity.value);

    if (normalizedTargetSelections.has(normalizedTargetId)) {
      addWarning({
        _tag: "DuplicateSelectionNormalized",
        node: {
          _tag: "target",
          targetId: normalizedTargetId,
        },
      });

      continue;
    }

    normalizedTargetSelections.add(normalizedTargetId);

    targetIdentities.set(normalizedTargetId, targetIdentity.value);
    upsertTarget(
      normalizedTargetId,
      targetIdentity.value,
      "selected",
      selectedCause({
        _tag: "target",
        targetId: normalizedTargetId,
      }),
    );

    if (requiresDomainApiTargetModule(targetIdentity.value)) {
      const domainTargetIdentity: TargetIdentity = {
        kind: "package",
        name: "domain",
      };
      const domainTargetId = toTargetId(domainTargetIdentity);
      const domainApiReference: BlueprintNodeReference = {
        _tag: "target-module",
        targetId: domainTargetId,
        moduleId: "domain-api",
      };
      const impliedDomainModuleEdgeId = addDependencyEdge(
        {
          _tag: "target",
          targetId: normalizedTargetId,
        },
        domainApiReference,
        "required-target-module",
      );
      const impliedOwningTargetEdgeId = addDependencyEdge(
        domainApiReference,
        {
          _tag: "target",
          targetId: domainTargetId,
        },
        "required-owning-target",
      );

      upsertTargetModule(domainTargetId, "domain-api", "implied", [
        dependencyCause(impliedDomainModuleEdgeId),
      ]);
      upsertTarget(domainTargetId, domainTargetIdentity, "implied", [
        dependencyCause(impliedOwningTargetEdgeId),
      ]);
      targetIdentities.set(domainTargetId, domainTargetIdentity);
    }
  }

  const normalizedTargetModuleSelections = new Set<string>();

  for (const targetModule of selectedTargetModules) {
    const targetIdentity =
      targetIdentities.get(targetModule.targetId) ??
      Option.getOrUndefined(
        toTargetIdentity({ targetId: targetModule.targetId }),
      );

    if (targetIdentity === undefined) {
      return {
        _tag: "failure",
        error: {
          _tag: "InvalidTargetModuleTarget",
          targetModule,
        },
      };
    }

    if (!isSupportedTargetModule(targetIdentity, targetModule.moduleId)) {
      return {
        _tag: "failure",
        error: {
          _tag: "UnsupportedTargetModule",
          targetModule,
        },
      };
    }

    const normalizedTargetId = toTargetId(targetIdentity);
    const normalizedTargetModuleKey = `${normalizedTargetId}:${targetModule.moduleId}`;

    if (normalizedTargetModuleSelections.has(normalizedTargetModuleKey)) {
      addWarning({
        _tag: "DuplicateSelectionNormalized",
        node: {
          _tag: "target-module",
          targetId: normalizedTargetId,
          moduleId: targetModule.moduleId,
        },
      });

      continue;
    }

    normalizedTargetModuleSelections.add(normalizedTargetModuleKey);

    const targetModuleReference: BlueprintNodeReference = {
      _tag: "target-module",
      targetId: normalizedTargetId,
      moduleId: targetModule.moduleId,
    };
    const owningTargetEdgeId = addDependencyEdge(
      targetModuleReference,
      {
        _tag: "target",
        targetId: normalizedTargetId,
      },
      "required-owning-target",
    );

    upsertTarget(normalizedTargetId, targetIdentity, "implied", [
      dependencyCause(owningTargetEdgeId),
    ]);
    upsertTargetModule(
      normalizedTargetId,
      targetModule.moduleId,
      "selected",
      selectedCause({
        ...targetModuleReference,
      }),
    );
  }

  const repoModules = new Map<string, ResolvedRepoModule>();
  const normalizedRepoModuleSelections = new Set<string>();

  for (const moduleId of selection.repoModules) {
    if (normalizedRepoModuleSelections.has(moduleId)) {
      addWarning({
        _tag: "DuplicateSelectionNormalized",
        node: {
          _tag: "repo-module",
          moduleId,
        },
      });

      continue;
    }

    normalizedRepoModuleSelections.add(moduleId);

    repoModules.set(moduleId, {
      moduleId,
      status: "selected",
      causes: selectedCause({
        _tag: "repo-module",
        moduleId,
      }),
    });
  }

  const rootBootstrapDependencyCauses = [...targets.values()].map((target) => {
    const edgeId = addDependencyEdge(
      {
        _tag: "target",
        targetId: target.targetId,
      },
      {
        _tag: "repo-module",
        moduleId: "root-bootstrap",
      },
      "required-repo-module",
    );

    return dependencyCause(edgeId);
  });

  if (rootBootstrapDependencyCauses.length > 0) {
    const existingRootBootstrap = repoModules.get("root-bootstrap");

    repoModules.set("root-bootstrap", {
      moduleId: "root-bootstrap",
      status: existingRootBootstrap?.status ?? "implied",
      causes: [
        ...(existingRootBootstrap?.causes ?? []),
        ...rootBootstrapDependencyCauses,
      ].sort(byBlueprintCause) as [BlueprintCause, ...Array<BlueprintCause>],
    });
  }

  for (const target of targets.values()) {
    const dependencyEdgeIds = toDependencyEdgeIds(target.causes);

    if (dependencyEdgeIds === undefined || target.status !== "selected") {
      continue;
    }

    addWarning({
      _tag: "RedundantSelectionNormalized",
      node: {
        _tag: "target",
        targetId: target.targetId,
      },
      edgeIds: dependencyEdgeIds,
    });
  }

  for (const targetModule of targetModules.values()) {
    const dependencyEdgeIds = toDependencyEdgeIds(targetModule.causes);

    if (dependencyEdgeIds === undefined || targetModule.status !== "selected") {
      continue;
    }

    addWarning({
      _tag: "RedundantSelectionNormalized",
      node: {
        _tag: "target-module",
        targetId: targetModule.targetId,
        moduleId: targetModule.moduleId,
      },
      edgeIds: dependencyEdgeIds,
    });
  }

  for (const repoModule of repoModules.values()) {
    const dependencyEdgeIds = toDependencyEdgeIds(repoModule.causes);

    if (dependencyEdgeIds === undefined || repoModule.status !== "selected") {
      continue;
    }

    addWarning({
      _tag: "RedundantSelectionNormalized",
      node: {
        _tag: "repo-module",
        moduleId: repoModule.moduleId,
      },
      edgeIds: dependencyEdgeIds,
    });
  }

  const resolvedTargets = [...targets.values()]
    .sort(byTargetId)
    .map((target) => ({
      ...target,
      targetModules: [...targetModules.values()]
        .filter((targetModule) => targetModule.targetId === target.targetId)
        .sort(byResolvedTargetModule)
        .map(({ moduleId, status, causes }) => ({
          moduleId,
          status,
          causes,
        }))
        .sort(byNestedResolvedTargetModule),
      composition: resolveTargetComposition(target.targetId, target.identity),
    }));

  return {
    _tag: "success",
    blueprint: {
      targets: resolvedTargets,
      repoModules: [...repoModules.values()].sort(byRepoModuleId),
      edges: [...edges.values()].sort(byBlueprintDependencyEdge),
      warnings: [...warnings.values()].sort(byBlueprintWarning),
    },
  };
};
