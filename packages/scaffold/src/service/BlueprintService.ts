import {
  Blueprint,
  type BlueprintCause,
  type BlueprintDependencyEdge,
  type BlueprintError,
  type BlueprintNodeReference,
  type BlueprintStatus,
  type BlueprintWarning,
  ConceptualTargetCollision,
  InvalidTarget,
  InvalidTargetModuleTarget,
  UnknownRepoModule,
  UnknownTargetKind,
  UnknownTargetModule,
  type ResolvedRepoModule,
  type ResolvedTarget,
  type ResolvedTargetModule,
  type TargetComposition,
  UnsupportedTargetModule,
} from "@repo/domain/Blueprint";
import {
  PackagePublicEntrypoint,
  RepoModuleId,
  TargetIdentity,
  TargetModuleId,
} from "@repo/domain/Scaffold";
import { Selection } from "@repo/domain/Selection";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { ModuleCatalog } from "../catalog/ModuleCatalog";
import { TargetCatalog } from "../catalog/TargetCatalog";

const decodeTargetIdentity = Schema.decodeUnknownOption(TargetIdentity);

type DependencyInput = {
  readonly from: typeof BlueprintNodeReference.Type;
  readonly reason: typeof BlueprintDependencyEdge.Type.reason;
};
type TargetModuleState = typeof ResolvedTargetModule.Type & {
  readonly targetId: string;
};

export class BlueprintService extends Context.Service<BlueprintService>()(
  "BlueprintService",
  {
    make: Effect.gen(function* () {
      const targetCatalog = yield* TargetCatalog;
      const moduleCatalog = yield* ModuleCatalog;

      const resolve = Effect.fn("BlueprintService.resolve")(function* (
        selection: typeof Selection.Type,
      ) {
        const targets = new Map<string, typeof ResolvedTarget.Type>();
        const targetModules = new Map<string, TargetModuleState>();
        const repoModules = new Map<string, typeof ResolvedRepoModule.Type>();
        const edges = new Map<string, typeof BlueprintDependencyEdge.Type>();
        const warnings = new Map<string, typeof BlueprintWarning.Type>();
        const conceptualPaths = new Map<string, string>();

        const addWarning = (warning: typeof BlueprintWarning.Type): void => {
          warnings.set(toBlueprintWarningKey(warning), warning);
        };

        const addDependencyEdge = (
          from: typeof BlueprintNodeReference.Type,
          to: typeof BlueprintNodeReference.Type,
          reason: typeof BlueprintDependencyEdge.Type.reason,
        ): string => {
          const edge: typeof BlueprintDependencyEdge.Type = {
            _tag: "depends-on",
            id: toBlueprintDependencyEdgeId({ from, to, reason }),
            from,
            to,
            reason,
          };

          edges.set(edge.id, edge);
          return edge.id;
        };

        const validateTarget = (
          targetId: string,
        ): Effect.Effect<typeof TargetIdentity.Type, typeof BlueprintError.Type> =>
          Effect.gen(function* () {
            const targetIdentityOption = getTargetIdentity({ id: targetId });

            if (Option.isNone(targetIdentityOption)) {
              return yield* Effect.fail(
                new InvalidTarget({
                  id: targetId,
                }),
              );
            }

            const targetDefinition = targetCatalog.getTargetDefinition(
              targetIdentityOption.value.kind,
            );

            if (targetDefinition === undefined) {
              return yield* Effect.fail(
                new UnknownTargetKind({
                  kind: targetIdentityOption.value.kind,
                }),
              );
            }

            const conceptualPath = getConceptualPath(
              targetIdentityOption.value,
            );
            const existingTargetId = conceptualPaths.get(conceptualPath);

            if (
              existingTargetId !== undefined &&
              existingTargetId !== targetId
            ) {
              return yield* Effect.fail(
                new ConceptualTargetCollision({
                  path: conceptualPath,
                  targetIds: [existingTargetId, targetId],
                }),
              );
            }

            conceptualPaths.set(conceptualPath, targetId);

            return targetIdentityOption.value;
          });

        const upsertTarget = ({
          id,
          identity,
          status,
          causes,
        }: Omit<typeof ResolvedTarget.Type, "targetModules" | "composition">): void => {
          const existingTarget = targets.get(id);

          if (existingTarget === undefined) {
            targets.set(id, {
              id,
              identity,
              status,
              causes: mergeCauses(causes),
              targetModules: [],
              composition: undefined,
            });
            return;
          }

          targets.set(id, {
            ...existingTarget,
            status:
              existingTarget.status === "selected" || status === "selected"
                ? "selected"
                : "implied",
            causes: mergeCauses([...existingTarget.causes, ...causes]),
          });
        };

        const upsertTargetModule = ({
          targetId,
          ...module
        }: TargetModuleState): void => {
          const { moduleId, status, causes } = module;
          const key = `${targetId}:${moduleId}`;
          const existingTargetModule = targetModules.get(key);

          if (existingTargetModule === undefined) {
            targetModules.set(key, {
              targetId,
              ...module,
              status,
              causes: mergeCauses(causes),
            });
            return;
          }

          targetModules.set(key, {
            ...existingTargetModule,
            status:
              existingTargetModule.status === "selected" ||
              status === "selected"
                ? "selected"
                : "implied",
            causes: mergeCauses([...existingTargetModule.causes, ...causes]),
          });
        };

        const upsertRepoModule = ({
          moduleId,
          status,
          causes,
        }: typeof ResolvedRepoModule.Type): void => {
          const existingRepoModule = repoModules.get(moduleId);

          if (existingRepoModule === undefined) {
            repoModules.set(moduleId, {
              moduleId,
              status,
              causes: mergeCauses(causes),
            });
            return;
          }

          repoModules.set(moduleId, {
            ...existingRepoModule,
            status:
              existingRepoModule.status === "selected" || status === "selected"
                ? "selected"
                : "implied",
            causes: mergeCauses([...existingRepoModule.causes, ...causes]),
          });
        };

        const requireRepoModule = ({
          moduleId,
          dependency,
        }: {
          readonly moduleId: typeof RepoModuleId.Type;
          readonly dependency: DependencyInput;
        }): Effect.Effect<void, typeof BlueprintError.Type> =>
          Effect.gen(function* () {
            if (moduleCatalog.getRepoModuleDefinition(moduleId) === undefined) {
              return yield* Effect.fail(
                new UnknownRepoModule({
                  id: moduleId,
                }),
              );
            }

            const edgeId = addDependencyEdge(
              dependency.from,
              repoModuleNode(moduleId),
              dependency.reason,
            );

            upsertRepoModule({
              moduleId,
              status: "implied",
              causes: [dependencyCause(edgeId)],
            });
          });

        const requireCanonicalTarget = ({
          identity,
          dependency,
        }: {
          readonly identity: typeof TargetIdentity.Type;
          readonly dependency: DependencyInput;
        }): Effect.Effect<string, typeof BlueprintError.Type> =>
          Effect.gen(function* () {
            const targetDefinition = targetCatalog.getTargetDefinition(
              identity.kind,
            );

            if (targetDefinition === undefined) {
              return yield* Effect.fail(
                new UnknownTargetKind({
                  kind: identity.kind,
                }),
              );
            }

            const targetId = toTargetId(identity);
            conceptualPaths.set(getConceptualPath(identity), targetId);
            const edgeId = addDependencyEdge(
              dependency.from,
              targetNode(targetId),
              dependency.reason,
            );

            upsertTarget({
              id: targetId,
              identity,
              status: "implied",
              causes: [dependencyCause(edgeId)],
            });

            for (const repoModuleId of targetDefinition.requiredRepoModules) {
              yield* requireRepoModule({
                moduleId: repoModuleId,
                dependency: {
                  from: targetNode(targetId),
                  reason: "required-repo-module",
                },
              });
            }

            return targetId;
          });

        const requireTargetModule = ({
          targetId,
          moduleId,
          dependency,
        }: {
          readonly targetId: string;
          readonly moduleId: typeof TargetModuleId.Type;
          readonly dependency: DependencyInput;
        }): Effect.Effect<void, typeof BlueprintError.Type> =>
          Effect.gen(function* () {
            const targetState = targets.get(targetId);

            if (targetState === undefined) {
              return yield* Effect.fail(
                new InvalidTargetModuleTarget({
                  module: {
                    targetId,
                    moduleId,
                  },
                }),
              );
            }

            const targetModuleDefinition =
              moduleCatalog.getTargetModuleDefinition(moduleId);

            if (targetModuleDefinition === undefined) {
              return yield* Effect.fail(
                new UnknownTargetModule({
                  id: moduleId,
                }),
              );
            }

            if (!targetModuleDefinition.isSupported(targetState.identity)) {
              return yield* Effect.fail(
                new UnsupportedTargetModule({
                  module: {
                    targetId,
                    moduleId,
                  },
                }),
              );
            }

            const edgeId = addDependencyEdge(
              dependency.from,
              targetModuleNode(targetId, moduleId),
              dependency.reason,
            );

            upsertTargetModule({
              targetId,
              moduleId,
              status: "implied",
              causes: [dependencyCause(edgeId)],
            });

            const owningTargetEdgeId = addDependencyEdge(
              targetModuleNode(targetId, moduleId),
              targetNode(targetId),
              "required-owning-target",
            );

            upsertTarget({
              id: targetId,
              identity: targetState.identity,
              status: "implied",
              causes: [dependencyCause(owningTargetEdgeId)],
            });
          });

        const normalizedTargetSelections = new Set<string>();

        for (const target of selection.targets) {
          const targetIdentity = yield* validateTarget(target.id);
          const normalizedTargetId = toTargetId(targetIdentity);

          if (normalizedTargetSelections.has(normalizedTargetId)) {
            addWarning({
              _tag: "DuplicateSelectionNormalized",
              node: targetNode(normalizedTargetId),
            });
            continue;
          }

          normalizedTargetSelections.add(normalizedTargetId);
          upsertTarget({
            id: normalizedTargetId,
            identity: targetIdentity,
            status: "selected",
            causes: selectedCause({
              ...targetNode(normalizedTargetId),
            }),
          });

          const targetDefinition = targetCatalog.getTargetDefinition(
            targetIdentity.kind,
          );

          if (targetDefinition === undefined) {
            return yield* Effect.fail(
              new UnknownTargetKind({
                kind: targetIdentity.kind,
              }),
            );
          }

          for (const repoModuleId of targetDefinition.requiredRepoModules) {
            yield* requireRepoModule({
              moduleId: repoModuleId,
                dependency: {
                  from: targetNode(normalizedTargetId),
                  reason: "required-repo-module",
                },
              });
          }
        }

        const normalizedRepoModuleSelections = new Set<string>();

        for (const moduleId of selection.repoModules) {
          if (normalizedRepoModuleSelections.has(moduleId)) {
            addWarning({
              _tag: "DuplicateSelectionNormalized",
              node: repoModuleNode(moduleId),
            });
            continue;
          }

          normalizedRepoModuleSelections.add(moduleId);

          if (moduleCatalog.getRepoModuleDefinition(moduleId) === undefined) {
            return yield* Effect.fail(
              new UnknownRepoModule({
                id: moduleId,
              }),
            );
          }

          upsertRepoModule({
            moduleId,
            status: "selected",
            causes: selectedCause({
              ...repoModuleNode(moduleId),
            }),
          });
        }

        const normalizedTargetModuleSelections = new Set<string>();

        for (const target of selection.targets) {
          const targetIdentity = yield* validateTarget(target.id);
          const normalizedTargetId = toTargetId(targetIdentity);

          for (const targetModule of target.modules) {
            const normalizedTargetModuleKey = `${normalizedTargetId}:${targetModule.id}`;

            if (
              normalizedTargetModuleSelections.has(normalizedTargetModuleKey)
            ) {
              addWarning({
                _tag: "DuplicateSelectionNormalized",
                node: {
                  ...targetModuleNode(normalizedTargetId, targetModule.id),
                },
              });
              continue;
            }

            normalizedTargetModuleSelections.add(normalizedTargetModuleKey);

            const targetModuleDefinition =
              moduleCatalog.getTargetModuleDefinition(targetModule.id);

            if (targetModuleDefinition === undefined) {
              return yield* Effect.fail(
                new UnknownTargetModule({
                  id: targetModule.id,
                }),
              );
            }

            if (!targetModuleDefinition.isSupported(targetIdentity)) {
              return yield* Effect.fail(
                new UnsupportedTargetModule({
                  module: {
                    targetId: normalizedTargetId,
                    moduleId: targetModule.id,
                  },
                }),
              );
            }

            const targetModuleReference = targetModuleNode(
              normalizedTargetId,
              targetModule.id,
            );

            const owningTargetEdgeId = addDependencyEdge(
              targetModuleReference,
              targetNode(normalizedTargetId),
              "required-owning-target",
            );

            upsertTarget({
              id: normalizedTargetId,
              identity: targetIdentity,
              status: "implied",
              causes: [dependencyCause(owningTargetEdgeId)],
            });
            upsertTargetModule({
              targetId: normalizedTargetId,
              moduleId: targetModule.id,
              status: "selected",
              causes: selectedCause(targetModuleReference),
            });

            for (const dependency of targetModuleDefinition.dependencies) {
              if (dependency.requiredCanonicalTarget !== undefined) {
                const requiredTargetId = yield* requireCanonicalTarget({
                  identity: dependency.requiredCanonicalTarget,
                  dependency: {
                    from: targetModuleReference,
                    reason: "required-canonical-target",
                  },
                });

                if (dependency.requiredTargetModule !== undefined) {
                  yield* requireTargetModule({
                    targetId: requiredTargetId,
                    moduleId: dependency.requiredTargetModule.moduleId,
                    dependency: {
                      from: targetModuleReference,
                      reason: "required-target-module",
                    },
                  });
                }
              }
            }
          }
        }

        for (const target of targets.values()) {
          const dependencyEdgeIds = toDependencyEdgeIds(target.causes);

          if (target.status === "selected" && dependencyEdgeIds !== undefined) {
            addWarning({
              _tag: "RedundantSelectionNormalized",
              node: targetNode(target.id),
              edgeIds: dependencyEdgeIds,
            });
          }
        }

        for (const targetModule of targetModules.values()) {
          const dependencyEdgeIds = toDependencyEdgeIds(targetModule.causes);

          if (
            targetModule.status === "selected" &&
            dependencyEdgeIds !== undefined
          ) {
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
        }

        for (const repoModule of repoModules.values()) {
          const dependencyEdgeIds = toDependencyEdgeIds(repoModule.causes);

          if (
            repoModule.status === "selected" &&
            dependencyEdgeIds !== undefined
          ) {
            addWarning({
              _tag: "RedundantSelectionNormalized",
              node: repoModuleNode(repoModule.moduleId),
              edgeIds: dependencyEdgeIds,
            });
          }
        }

        return new Blueprint({
          nodes: [...targets.values()].sort(byTargetId).map((target) => ({
            ...target,
            targetModules: [...targetModules.values()]
              .filter((targetModule) => targetModule.targetId === target.id)
              .sort(byNestedResolvedTargetModule)
              .map(({ targetId: _targetId, ...module }) => module),
            composition: resolveTargetComposition(target.id, targetModules),
          })),
          modules: [...repoModules.values()].sort(byRepoModuleId),
          edges: [...edges.values()].sort(byBlueprintDependencyEdge),
          warnings: [...warnings.values()].sort(byBlueprintWarning),
        });
      });

      return { resolve };
    }),
  },
) {
  static readonly layer = Layer.effect(BlueprintService)(
    BlueprintService.make,
  ).pipe(
    Layer.provide(TargetCatalog.layer),
    Layer.provide(ModuleCatalog.layer),
  );
}

const getTargetIdentity = ({
  id,
}: {
  readonly id: string;
}): Option.Option<typeof TargetIdentity.Type> => {
  const [kind, name, ...rest] = id.split("/");

  if (rest.length > 0 || kind === undefined || name === undefined) {
    return Option.none();
  }

  return decodeTargetIdentity({
    kind,
    name,
  });
};

const getConceptualPath = (identity: typeof TargetIdentity.Type) =>
  `${identity.kind === "package" ? "packages" : "apps"}/${identity.name}`;

const toTargetId = ({ kind, name }: typeof TargetIdentity.Type): string =>
  `${kind}/${name}`;

const targetNode = (id: string): typeof BlueprintNodeReference.Type => ({
  _tag: "target",
  id,
});

const repoModuleNode = (
  id: typeof RepoModuleId.Type,
): typeof BlueprintNodeReference.Type => ({
  _tag: "repo-module",
  id,
});

const targetModuleNode = (
  targetId: string,
  moduleId: typeof TargetModuleId.Type,
): typeof BlueprintNodeReference.Type => ({
  _tag: "target-module",
  targetId,
  moduleId,
});

const byTargetId = (
  left: { readonly id: string },
  right: { readonly id: string },
): number => left.id.localeCompare(right.id);

const byRepoModuleId = (
  left: { readonly moduleId: string },
  right: { readonly moduleId: string },
): number => left.moduleId.localeCompare(right.moduleId);

const byNestedResolvedTargetModule = (
  left: { readonly moduleId: string },
  right: { readonly moduleId: string },
): number => left.moduleId.localeCompare(right.moduleId);

const toBlueprintNodeReferenceKey = (
  reference: typeof BlueprintNodeReference.Type,
): string => {
  switch (reference._tag) {
    case "repo-module":
      return `repo-module:${reference.id}`;
    case "target":
      return `target:${reference.id}`;
    case "target-module":
      return `target-module:${reference.targetId}:${reference.moduleId}`;
  }
};

const byBlueprintCause = (
  left: typeof BlueprintCause.Type,
  right: typeof BlueprintCause.Type,
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

const mergeCauses = (
  causes: ReadonlyArray<typeof BlueprintCause.Type>,
): [typeof BlueprintCause.Type, ...Array<typeof BlueprintCause.Type>] => {
  const deduped = new Map<string, typeof BlueprintCause.Type>();

  for (const cause of causes) {
    deduped.set(toBlueprintCauseKey(cause), cause);
  }

  return [...deduped.values()].sort(byBlueprintCause) as [
    typeof BlueprintCause.Type,
    ...Array<typeof BlueprintCause.Type>,
  ];
};

const selectedCause = (
  source: typeof BlueprintNodeReference.Type,
): readonly [
  typeof BlueprintCause.Type,
  ...Array<typeof BlueprintCause.Type>,
] => [
  {
    _tag: "selection",
    source,
  },
];

const dependencyCause = (edgeId: string): typeof BlueprintCause.Type => ({
  _tag: "dependency",
  edgeId,
});

const toDependencyEdgeIds = (
  causes: ReadonlyArray<typeof BlueprintCause.Type>,
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

const resolveTargetComposition = (
  targetId: string,
  targetModules: ReadonlyMap<string, TargetModuleState>,
): typeof TargetComposition.Type | undefined => {
  if (!targetId.startsWith("package/")) {
    return undefined;
  }

  return {
    _tag: "package",
    publicEntrypoint: targetModules.has(`${targetId}:domain-api`)
      ? ("./Api" satisfies typeof PackagePublicEntrypoint.Type)
      : ("." satisfies typeof PackagePublicEntrypoint.Type),
  };
};

const toBlueprintCauseKey = (cause: typeof BlueprintCause.Type): string => {
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
  readonly from: typeof BlueprintNodeReference.Type;
  readonly to: typeof BlueprintNodeReference.Type;
  readonly reason: typeof BlueprintDependencyEdge.Type.reason;
}): string =>
  [
    reason,
    toBlueprintNodeReferenceKey(from),
    toBlueprintNodeReferenceKey(to),
  ].join("=>");

const byBlueprintDependencyEdge = (
  left: typeof BlueprintDependencyEdge.Type,
  right: typeof BlueprintDependencyEdge.Type,
): number => left.id.localeCompare(right.id);

const toBlueprintWarningKey = (
  warning: typeof BlueprintWarning.Type,
): string => {
  switch (warning._tag) {
    case "DuplicateSelectionNormalized":
      return `${warning._tag}:${toBlueprintNodeReferenceKey(warning.node)}`;
    case "RedundantSelectionNormalized":
      return `${warning._tag}:${toBlueprintNodeReferenceKey(warning.node)}:${warning.edgeIds.join("|")}`;
  }
};

const byBlueprintWarning = (
  left: typeof BlueprintWarning.Type,
  right: typeof BlueprintWarning.Type,
): number =>
  toBlueprintWarningKey(left).localeCompare(toBlueprintWarningKey(right));
