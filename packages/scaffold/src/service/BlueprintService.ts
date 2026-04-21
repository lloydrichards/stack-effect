import {
  Blueprint,
  type BlueprintCause,
  type BlueprintError,
  type BlueprintIntent,
  type BlueprintNodeReference,
  type BlueprintStatus,
  type Blueprint as BlueprintType,
  type BlueprintWarning,
} from "@repo/domain/Blueprint";
import type {
  PackagePublicEntrypoint,
  RepoModuleId,
  TargetIdentity,
  TargetModuleId,
} from "@repo/domain/Scaffold";
import { Selection } from "@repo/domain/Selection";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { ModuleCatalog } from "../catalog/ModuleCatalog";
import { TargetCatalog } from "../catalog/TargetCatalog";

type ResolvedTargetState = {
  readonly targetId: string;
  readonly identity: typeof TargetIdentity.Type;
  readonly status: typeof BlueprintStatus.Type;
  readonly causes: [
    typeof BlueprintCause.Type,
    ...Array<typeof BlueprintCause.Type>,
  ];
};

type ResolvedTargetModuleState = {
  readonly targetId: string;
  readonly moduleId: typeof TargetModuleId.Type;
  readonly status: typeof BlueprintStatus.Type;
  readonly causes: [
    typeof BlueprintCause.Type,
    ...Array<typeof BlueprintCause.Type>,
  ];
};

type ResolvedRepoModuleState = {
  readonly moduleId: typeof RepoModuleId.Type;
  readonly status: typeof BlueprintStatus.Type;
  readonly causes: [
    typeof BlueprintCause.Type,
    ...Array<typeof BlueprintCause.Type>,
  ];
};

const decodeSelection = Schema.decodeUnknownOption(Selection);
const encodeBlueprint = Schema.encodeSync(Blueprint);

export class BlueprintService extends Context.Service<BlueprintService>()(
  "BlueprintService",
  {
    make: Effect.gen(function* () {
      const targetCatalog = yield* TargetCatalog;
      const moduleCatalog = yield* ModuleCatalog;

      const resolve = Effect.fn("BlueprintService.resolve")(function* (
        selection: typeof Selection.Type,
      ) {
        const decodedSelection = decodeSelection(selection);

        if (Option.isNone(decodedSelection)) {
          return yield* Effect.fail<typeof BlueprintError.Type>({
            _tag: "InvalidTarget",
            targetId: "invalid-selection",
          });
        }

        const targets = new Map<string, ResolvedTargetState>();
        const targetModules = new Map<string, ResolvedTargetModuleState>();
        const repoModules = new Map<string, ResolvedRepoModuleState>();
        const targetCompositions = new Map<
          string,
          {
            readonly _tag: "package";
            readonly publicEntrypoint: typeof PackagePublicEntrypoint.Type;
          }
        >();
        const warnings = new Map<string, typeof BlueprintWarning.Type>();
        const conceptualPaths = new Map<string, string>();

        const addWarning = (warning: typeof BlueprintWarning.Type): void => {
          warnings.set(toBlueprintWarningKey(warning), warning);
        };

        const validateTarget = (
          targetId: string,
        ): Effect.Effect<
          typeof TargetIdentity.Type,
          typeof BlueprintError.Type
        > =>
          Effect.gen(function* () {
            const targetIdentityOption = getTargetIdentity({ targetId });

            if (Option.isNone(targetIdentityOption)) {
              return yield* Effect.fail({
                _tag: "InvalidTarget",
                targetId,
              } satisfies typeof BlueprintError.Type);
            }

            const targetDefinition = targetCatalog.getTargetDefinition(
              targetIdentityOption.value.kind,
            );

            if (targetDefinition === undefined) {
              return yield* Effect.fail({
                _tag: "UnknownTargetKind",
                targetKind: targetIdentityOption.value.kind,
              } satisfies typeof BlueprintError.Type);
            }

            const conceptualPath = getConceptualPath(
              targetIdentityOption.value,
            );
            const existingTargetId = conceptualPaths.get(conceptualPath);

            if (
              existingTargetId !== undefined &&
              existingTargetId !== targetId
            ) {
              return yield* Effect.fail({
                _tag: "ConceptualTargetCollision",
                conceptualPath,
                targetIds: [existingTargetId, targetId],
              } satisfies typeof BlueprintError.Type);
            }

            conceptualPaths.set(conceptualPath, targetId);

            return targetIdentityOption.value;
          });

        const upsertTarget = (
          targetId: string,
          identity: typeof TargetIdentity.Type,
          status: typeof BlueprintStatus.Type,
          causes: ReadonlyArray<typeof BlueprintCause.Type>,
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
          moduleId: typeof TargetModuleId.Type,
          status: typeof BlueprintStatus.Type,
          causes: ReadonlyArray<typeof BlueprintCause.Type>,
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
              existingTargetModule.status === "selected" ||
              status === "selected"
                ? "selected"
                : "implied",
            causes: mergeCauses([...existingTargetModule.causes, ...causes]),
          });
        };

        const upsertRepoModule = (
          moduleId: typeof RepoModuleId.Type,
          status: typeof BlueprintStatus.Type,
          causes: ReadonlyArray<typeof BlueprintCause.Type>,
        ): void => {
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

        const requireRepoModule = (
          moduleId: typeof RepoModuleId.Type,
          causes: ReadonlyArray<typeof BlueprintCause.Type>,
        ): Effect.Effect<void, typeof BlueprintError.Type> =>
          Effect.gen(function* () {
            if (moduleCatalog.getRepoModuleDefinition(moduleId) === undefined) {
              return yield* Effect.fail({
                _tag: "UnknownRepoModule",
                moduleId,
              } satisfies typeof BlueprintError.Type);
            }

            upsertRepoModule(moduleId, "implied", causes);
          });

        const requireCanonicalTarget = (
          identity: typeof TargetIdentity.Type,
          causes: ReadonlyArray<typeof BlueprintCause.Type>,
        ): Effect.Effect<string, typeof BlueprintError.Type> =>
          Effect.gen(function* () {
            const targetDefinition = targetCatalog.getTargetDefinition(
              identity.kind,
            );

            if (targetDefinition === undefined) {
              return yield* Effect.fail({
                _tag: "UnknownTargetKind",
                targetKind: identity.kind,
              } satisfies typeof BlueprintError.Type);
            }

            const targetId = toTargetId(identity);
            conceptualPaths.set(getConceptualPath(identity), targetId);
            upsertTarget(targetId, identity, "implied", causes);

            for (const repoModuleId of targetDefinition.requiredRepoModules) {
              yield* requireRepoModule(repoModuleId, [
                dependencyCause({
                  _tag: "target",
                  targetId,
                }),
              ]);
            }

            return targetId;
          });

        const requireTargetModule = (
          targetId: string,
          moduleId: typeof TargetModuleId.Type,
          causes: ReadonlyArray<typeof BlueprintCause.Type>,
        ): Effect.Effect<void, typeof BlueprintError.Type> =>
          Effect.gen(function* () {
            const targetState = targets.get(targetId);

            if (targetState === undefined) {
              return yield* Effect.fail({
                _tag: "InvalidTargetModuleTarget",
                targetModule: {
                  targetId,
                  moduleId,
                },
              } satisfies typeof BlueprintError.Type);
            }

            const targetModuleDefinition =
              moduleCatalog.getTargetModuleDefinition(moduleId);

            if (targetModuleDefinition === undefined) {
              return yield* Effect.fail({
                _tag: "UnknownTargetModule",
                moduleId,
              } satisfies typeof BlueprintError.Type);
            }

            if (!targetModuleDefinition.isSupported(targetState.identity)) {
              return yield* Effect.fail({
                _tag: "UnsupportedTargetModule",
                targetModule: {
                  targetId,
                  moduleId,
                },
              } satisfies typeof BlueprintError.Type);
            }

            upsertTargetModule(targetId, moduleId, "implied", causes);
          });

        const normalizedTargetSelections = new Set<string>();

        for (const target of decodedSelection.value.targets) {
          const targetIdentity = yield* validateTarget(target.targetId);
          const normalizedTargetId = toTargetId(targetIdentity);

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
          upsertTarget(
            normalizedTargetId,
            targetIdentity,
            "selected",
            selectedCause({
              _tag: "target",
              targetId: normalizedTargetId,
            }),
          );

          const targetDefinition = targetCatalog.getTargetDefinition(
            targetIdentity.kind,
          );

          if (targetDefinition === undefined) {
            return yield* Effect.fail({
              _tag: "UnknownTargetKind",
              targetKind: targetIdentity.kind,
            } satisfies typeof BlueprintError.Type);
          }

          for (const repoModuleId of targetDefinition.requiredRepoModules) {
            yield* requireRepoModule(repoModuleId, [
              dependencyCause({
                _tag: "target",
                targetId: normalizedTargetId,
              }),
            ]);
          }
        }

        const normalizedRepoModuleSelections = new Set<string>();

        for (const moduleId of decodedSelection.value.repoModules) {
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

          if (moduleCatalog.getRepoModuleDefinition(moduleId) === undefined) {
            return yield* Effect.fail({
              _tag: "UnknownRepoModule",
              moduleId,
            } satisfies typeof BlueprintError.Type);
          }

          upsertRepoModule(
            moduleId,
            "selected",
            selectedCause({
              _tag: "repo-module",
              moduleId,
            }),
          );
        }

        const normalizedTargetModuleSelections = new Set<string>();

        for (const target of decodedSelection.value.targets) {
          const targetIdentity = yield* validateTarget(target.targetId);
          const normalizedTargetId = toTargetId(targetIdentity);

          for (const targetModule of target.targetModules) {
            const normalizedTargetModuleKey = `${normalizedTargetId}:${targetModule.moduleId}`;

            if (
              normalizedTargetModuleSelections.has(normalizedTargetModuleKey)
            ) {
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

            const targetModuleDefinition =
              moduleCatalog.getTargetModuleDefinition(targetModule.moduleId);

            if (targetModuleDefinition === undefined) {
              return yield* Effect.fail({
                _tag: "UnknownTargetModule",
                moduleId: targetModule.moduleId,
              } satisfies typeof BlueprintError.Type);
            }

            if (!targetModuleDefinition.isSupported(targetIdentity)) {
              return yield* Effect.fail({
                _tag: "UnsupportedTargetModule",
                targetModule: {
                  targetId: normalizedTargetId,
                  moduleId: targetModule.moduleId,
                },
              } satisfies typeof BlueprintError.Type);
            }

            const targetModuleReference: typeof BlueprintNodeReference.Type = {
              _tag: "target-module",
              targetId: normalizedTargetId,
              moduleId: targetModule.moduleId,
            };

            upsertTarget(normalizedTargetId, targetIdentity, "implied", [
              dependencyCause(targetModuleReference),
            ]);
            upsertTargetModule(
              normalizedTargetId,
              targetModule.moduleId,
              "selected",
              selectedCause(targetModuleReference),
            );

            for (const dependency of targetModuleDefinition.dependencies) {
              if (dependency.requiredCanonicalTarget !== undefined) {
                const requiredTargetId = yield* requireCanonicalTarget(
                  dependency.requiredCanonicalTarget,
                  [dependencyCause(targetModuleReference)],
                );

                if (dependency.requiredTargetModule !== undefined) {
                  yield* requireTargetModule(
                    requiredTargetId,
                    dependency.requiredTargetModule.moduleId,
                    [
                      dependencyCause({
                        _tag: "target",
                        targetId: normalizedTargetId,
                      }),
                    ],
                  );
                  upsertTarget(
                    requiredTargetId,
                    dependency.requiredTargetModule.target,
                    "implied",
                    [
                      dependencyCause({
                        _tag: "target-module",
                        targetId: requiredTargetId,
                        moduleId: dependency.requiredTargetModule.moduleId,
                      }),
                    ],
                  );
                }
              }
            }
          }
        }

        for (const target of targets.values()) {
          const composition = resolveTargetComposition(
            target.targetId,
            targetModules,
          );

          if (composition === undefined) {
            continue;
          }

          const existingComposition = targetCompositions.get(target.targetId);

          if (
            existingComposition !== undefined &&
            existingComposition.publicEntrypoint !==
              composition.publicEntrypoint
          ) {
            return yield* Effect.fail({
              _tag: "ContradictoryTargetComposition",
              targetId: target.targetId,
              slot: "package-public-entrypoint",
            } satisfies typeof BlueprintError.Type);
          }

          targetCompositions.set(target.targetId, composition);
        }

        for (const target of targets.values()) {
          const dependencySources = toDependencySources(target.causes);

          if (dependencySources !== undefined) {
            addWarning({
              _tag:
                target.status === "selected"
                  ? "RedundantSelectionNormalized"
                  : "ImpliedDependencyAdded",
              node: {
                _tag: "target",
                targetId: target.targetId,
              },
              causes: dependencySources,
            });
          }
        }

        for (const targetModule of targetModules.values()) {
          const dependencySources = toDependencySources(targetModule.causes);

          if (dependencySources !== undefined) {
            addWarning({
              _tag:
                targetModule.status === "selected"
                  ? "RedundantSelectionNormalized"
                  : "ImpliedDependencyAdded",
              node: {
                _tag: "target-module",
                targetId: targetModule.targetId,
                moduleId: targetModule.moduleId,
              },
              causes: dependencySources,
            });
          }
        }

        for (const repoModule of repoModules.values()) {
          const dependencySources = toDependencySources(repoModule.causes);

          if (dependencySources !== undefined) {
            addWarning({
              _tag:
                repoModule.status === "selected"
                  ? "RedundantSelectionNormalized"
                  : "ImpliedDependencyAdded",
              node: {
                _tag: "repo-module",
                moduleId: repoModule.moduleId,
              },
              causes: dependencySources,
            });
          }
        }

        const intents = [
          ...[...repoModules.values()].map(
            (repoModule): typeof BlueprintIntent.Type => ({
              _tag: "RepoModule",
              moduleId: repoModule.moduleId,
            }),
          ),
          ...[...targets.values()].map(
            (target): typeof BlueprintIntent.Type => ({
              _tag: "Target",
              targetId: target.targetId,
            }),
          ),
          ...[...targetModules.values()].map(
            (targetModule): typeof BlueprintIntent.Type => ({
              _tag: "TargetModule",
              targetId: targetModule.targetId,
              moduleId: targetModule.moduleId,
            }),
          ),
          ...[...targetCompositions.entries()].map(
            ([targetId, composition]): typeof BlueprintIntent.Type => ({
              _tag: "PackageEntrypoint",
              targetId,
              publicEntrypoint: composition.publicEntrypoint,
            }),
          ),
        ].sort(byBlueprintIntent);

        return encodeBlueprint({
          targets: [...targets.values()].sort(byTargetId).map((target) => ({
            ...target,
            targetModules: [...targetModules.values()]
              .filter(
                (targetModule) => targetModule.targetId === target.targetId,
              )
              .sort(byNestedResolvedTargetModule)
              .map(({ moduleId, status, causes }) => ({
                moduleId,
                status,
                causes,
              })),
          })),
          repoModules: [...repoModules.values()].sort(byRepoModuleId),
          targetCompositions: Object.fromEntries(
            [...targetCompositions.entries()].sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
          intents,
          warnings: [...warnings.values()].sort(byBlueprintWarning),
        } satisfies typeof BlueprintType.Type);
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
  targetId,
}: {
  readonly targetId: string;
}): Option.Option<typeof TargetIdentity.Type> => {
  const [kind, name, ...rest] = targetId.split("/");

  if (rest.length > 0 || kind === undefined || name === undefined) {
    return Option.none();
  }

  const decodedKind = Schema.decodeUnknownOption(
    Schema.Union([
      Schema.Literal("client"),
      Schema.Literal("server"),
      Schema.Literal("server-mcp"),
      Schema.Literal("cli"),
      Schema.Literal("package"),
    ]),
  )(kind);
  const decodedName = Schema.decodeUnknownOption(
    Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
  )(name);

  if (Option.isNone(decodedKind) || Option.isNone(decodedName)) {
    return Option.none();
  }

  return Option.some({
    kind: decodedKind.value,
    name: decodedName.value,
  });
};

const getConceptualPath = (identity: typeof TargetIdentity.Type) =>
  `${identity.kind === "package" ? "packages" : "apps"}/${identity.name}`;

const toTargetId = ({ kind, name }: typeof TargetIdentity.Type): string =>
  `${kind}/${name}`;

const byTargetId = (
  left: { readonly targetId: string },
  right: { readonly targetId: string },
): number => left.targetId.localeCompare(right.targetId);

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
      return `repo-module:${reference.moduleId}`;
    case "target":
      return `target:${reference.targetId}`;
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

  return toBlueprintNodeReferenceKey(left.source).localeCompare(
    toBlueprintNodeReferenceKey(right.source),
  );
};

const mergeCauses = (
  causes: ReadonlyArray<typeof BlueprintCause.Type>,
): [typeof BlueprintCause.Type, ...Array<typeof BlueprintCause.Type>] =>
  [...causes].sort(byBlueprintCause) as [
    typeof BlueprintCause.Type,
    ...Array<typeof BlueprintCause.Type>,
  ];

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

const dependencyCause = (
  source: typeof BlueprintNodeReference.Type,
): typeof BlueprintCause.Type => ({
  _tag: "dependency",
  source,
});

const toDependencySources = (
  causes: ReadonlyArray<typeof BlueprintCause.Type>,
):
  | [
      typeof BlueprintNodeReference.Type,
      ...Array<typeof BlueprintNodeReference.Type>,
    ]
  | undefined => {
  const dependencySources = new Map<
    string,
    typeof BlueprintNodeReference.Type
  >();

  for (const cause of causes) {
    if (cause._tag === "dependency") {
      dependencySources.set(
        toBlueprintNodeReferenceKey(cause.source),
        cause.source,
      );
    }
  }

  if (dependencySources.size === 0) {
    return undefined;
  }

  return [...dependencySources.values()].sort((left, right) =>
    toBlueprintNodeReferenceKey(left).localeCompare(
      toBlueprintNodeReferenceKey(right),
    ),
  ) as [
    typeof BlueprintNodeReference.Type,
    ...Array<typeof BlueprintNodeReference.Type>,
  ];
};

const resolveTargetComposition = (
  targetId: string,
  targetModules: ReadonlyMap<string, ResolvedTargetModuleState>,
):
  | {
      readonly _tag: "package";
      readonly publicEntrypoint: typeof PackagePublicEntrypoint.Type;
    }
  | undefined => {
  if (!targetId.startsWith("package/")) {
    return undefined;
  }

  return {
    _tag: "package",
    publicEntrypoint: targetModules.has(`${targetId}:domain-api`)
      ? "./Api"
      : ".",
  };
};

const toBlueprintIntentKey = (intent: typeof BlueprintIntent.Type): string => {
  switch (intent._tag) {
    case "PackageEntrypoint":
      return `${intent._tag}:${intent.targetId}:${intent.publicEntrypoint}`;
    case "RepoModule":
      return `${intent._tag}:${intent.moduleId}`;
    case "Target":
      return `${intent._tag}:${intent.targetId}`;
    case "TargetModule":
      return `${intent._tag}:${intent.targetId}:${intent.moduleId}`;
  }
};

const byBlueprintIntent = (
  left: typeof BlueprintIntent.Type,
  right: typeof BlueprintIntent.Type,
): number =>
  toBlueprintIntentKey(left).localeCompare(toBlueprintIntentKey(right));

const toBlueprintWarningKey = (
  warning: typeof BlueprintWarning.Type,
): string => {
  switch (warning._tag) {
    case "DuplicateSelectionNormalized":
      return `${warning._tag}:${toBlueprintNodeReferenceKey(warning.node)}`;
    case "ImpliedDependencyAdded":
    case "RedundantSelectionNormalized":
      return `${warning._tag}:${toBlueprintNodeReferenceKey(warning.node)}:${warning.causes
        .map(toBlueprintNodeReferenceKey)
        .join("|")}`;
  }
};

const byBlueprintWarning = (
  left: typeof BlueprintWarning.Type,
  right: typeof BlueprintWarning.Type,
): number =>
  toBlueprintWarningKey(left).localeCompare(toBlueprintWarningKey(right));
