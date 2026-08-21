import { Array as Arr, Data, Order, Schema } from "effect";
import {
  CatalogNotFound,
  GenerationDomainBinding,
  ModuleId,
  TargetIdentity,
  TargetKey,
} from "./Catalog";
import { idOrd } from "./Order";

export { CatalogNotFound };

export class BlueprintFailure extends Data.TaggedError("BlueprintFailure")<{
  message: string;
  cause?: unknown;
  reason?:
    | "binding-cardinality"
    | "unsupported-target"
    | "unsupported-module"
    | "binding-target-missing";
  domainId?: string;
  optionId?: string;
  targetId?: string;
  targetIds?: ReadonlyArray<string>;
  moduleId?: string;
  moduleSource?: "selected" | "resolved";
}> {}

/**
 * Represents a resolved target workspace in the blueprint graph.
 *
 * @category Blueprint
 * @since 1.0.0
 */
export const BlueprintTargetNode = Schema.TaggedStruct("target", {
  id: TargetKey,
  identity: TargetIdentity,
});

/**
 * Represents a module attached to a specific target in the blueprint graph.
 * The composite ID encodes both the owning target and the module identity.
 *
 * @category Blueprint
 * @since 1.0.0
 */
export const BlueprintAttachedModuleNode = Schema.TaggedStruct(
  "attached-module",
  {
    id: Schema.TemplateLiteral([TargetKey, "#", ModuleId]),
    targetId: TargetKey,
    moduleId: ModuleId,
  },
);

export const BlueprintNode = Schema.Union([
  BlueprintTargetNode,
  BlueprintAttachedModuleNode,
]).pipe(Schema.toTaggedUnion("_tag"));

export const blueprintNodeOrd = Order.mapInput(
  Order.combineAll<typeof BlueprintNode.Type>([
    Order.mapInput(Order.String, (node) => node._tag),
    Order.mapInput(Order.String, (node) => node.id),
  ]),
  (node: typeof BlueprintNode.Type) => node,
);

const duplicates = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  Arr.map(
    Arr.filter(
      Object.entries(Arr.groupBy(values, (value) => value)),
      ([, groupedValues]) => groupedValues.length > 1,
    ),
    ([value]) => value,
  );

const BlueprintFields = Schema.Struct({
  nodes: Schema.Array(BlueprintNode),
  domainBindings: Schema.optional(Schema.Array(GenerationDomainBinding)),
  edges: Schema.Array(
    Schema.Struct({
      id: Schema.NonEmptyString,
      from: Schema.NonEmptyString,
      to: Schema.NonEmptyString,
      reason: Schema.Literals([
        "owns-module",
        "required-target",
        "required-module",
      ]),
    }),
  ),
}).check(
  Schema.makeFilter((blueprint) => {
    const duplicateNodeIds = Arr.map(
      duplicates(Arr.map(blueprint.nodes, (node) => node.id)),
      (id) => `Blueprint node id must be unique: ${id}`,
    );
    const duplicateEdgeIds = Arr.map(
      duplicates(Arr.map(blueprint.edges, (edge) => edge.id)),
      (id) => `Blueprint edge id must be unique: ${id}`,
    );
    const targetIdentityIssues = blueprint.nodes.flatMap((node) =>
      node._tag === "target" && node.id !== node.identity.toKey()
        ? [
            `Blueprint target id must match its canonical identity: expected ${node.identity.toKey()}, received ${node.id}`,
          ]
        : [],
    );
    const attachedModules = blueprint.nodes.filter(
      BlueprintNode.guards["attached-module"],
    );
    const attachedModuleIssues = attachedModules.flatMap((node) => {
      const expectedId = toAttachedModuleNodeId(node.targetId, node.moduleId);
      const matchingTargets = blueprint.nodes.filter(
        (candidate) =>
          candidate._tag === "target" && candidate.id === node.targetId,
      );
      const matchingOwnershipEdges = blueprint.edges.filter(
        (edge) =>
          edge.reason === "owns-module" &&
          edge.from === node.targetId &&
          edge.to === node.id,
      );

      return [
        ...(node.id === expectedId
          ? []
          : [
              `Blueprint attached-module id must match its target and module identities: expected ${expectedId}, received ${node.id}`,
            ]),
        ...(matchingTargets.length === 1
          ? []
          : [
              `Blueprint attached module ${node.id} must resolve to exactly one target ${node.targetId}`,
            ]),
        ...(matchingOwnershipEdges.length === 1
          ? []
          : [
              `Blueprint attached module ${node.id} must have exactly one owns-module edge from ${node.targetId}`,
            ]),
      ];
    });
    const contradictoryOwnershipIssues = blueprint.edges
      .filter(
        (edge) =>
          edge.reason === "owns-module" &&
          !attachedModules.some(
            (node) => node.targetId === edge.from && node.id === edge.to,
          ),
      )
      .map(
        (edge) =>
          `Blueprint owns-module edge ${edge.id} does not match an attached module ownership relationship`,
      );

    return [
      ...duplicateNodeIds,
      ...duplicateEdgeIds,
      ...targetIdentityIssues,
      ...attachedModuleIssues,
      ...contradictoryOwnershipIssues,
    ];
  }),
);

/**
 * The resolved dependency closure for a Selection.
 *
 * A Blueprint expands user intent into a complete directed graph of targets
 * and their attached modules, including all transitive dependencies (required
 * targets and required modules). It is deterministic: identical Selections
 * always produce identical Blueprints.
 *
 * The graph is policy-free — it does not consider the current repo state.
 * That concern belongs to the Plan stage.
 *
 * @category Blueprint
 * @since 1.0.0
 */
export class Blueprint extends Schema.Class<Blueprint>("Blueprint")(
  BlueprintFields,
) {
  toSorted(): Blueprint {
    return new Blueprint({
      nodes: [...this.nodes].sort(blueprintNodeOrd),
      edges: [...this.edges].sort(idOrd),
      ...(this.domainBindings === undefined
        ? {}
        : { domainBindings: this.domainBindings }),
    });
  }

  hasTarget(targetId: string): boolean {
    return this.nodes.some(
      (node): node is typeof BlueprintTargetNode.Type =>
        BlueprintNode.guards.target(node) && node.id === targetId,
    );
  }

  getTarget(targetId: string): typeof BlueprintTargetNode.Type | undefined {
    return this.nodes.find(
      (node): node is typeof BlueprintTargetNode.Type =>
        BlueprintNode.guards.target(node) && node.id === targetId,
    );
  }
}

export const toAttachedModuleNodeId = (
  targetId: typeof TargetKey.Type,
  moduleId: typeof ModuleId.Type,
): typeof BlueprintAttachedModuleNode.fields.id.Type =>
  `${targetId}#${moduleId}`;
