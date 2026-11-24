import { Order, Schema } from "effect";
import {
  CatalogNotFound,
  duplicates,
  ModuleId,
  TargetIdentity,
  TargetKey,
} from "./Catalog";

/** Orders Blueprint edges by their `id`. */
export const edgeOrder = Order.mapInput(
  Order.String,
  (edge: { id: string }) => edge.id,
);

export { CatalogNotFound };

export class BlueprintError extends Schema.TaggedError<BlueprintError>()(
  "BlueprintError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

/**
 * Represents a resolved target workspace in the blueprint graph.
 *
 * @category Blueprint
 * @since 1.0.0
 */
const BlueprintTargetNode = Schema.TaggedStruct("target", {
  id: TargetKey,
  identity: TargetIdentity,
});

export type BlueprintTargetNode = typeof BlueprintTargetNode.Type;

/**
 * Identifies a module attached to a target. `toAttachedModuleNodeId` owns the
 * `<target>#<module>` format.
 *
 * @category Blueprint
 * @since 1.0.0
 */
const BlueprintAttachedModuleNodeId = Schema.TemplateLiteral([
  TargetKey,
  "#",
  ModuleId,
]).pipe(Schema.brand("BlueprintAttachedModuleNodeId"));

export type BlueprintAttachedModuleNodeId =
  typeof BlueprintAttachedModuleNodeId.Type;

/**
 * Represents a module attached to a specific target in the blueprint graph.
 * The composite ID encodes both the owning target and the module identity.
 *
 * @category Blueprint
 * @since 1.0.0
 */
const BlueprintAttachedModuleNode = Schema.TaggedStruct("attached-module", {
  id: BlueprintAttachedModuleNodeId,
  targetId: TargetKey,
  moduleId: ModuleId,
});

export type BlueprintAttachedModuleNode =
  typeof BlueprintAttachedModuleNode.Type;

export const BlueprintNode = Schema.Union([
  BlueprintTargetNode,
  BlueprintAttachedModuleNode,
]).pipe(Schema.toTaggedUnion("_tag"));

export type BlueprintNode = typeof BlueprintNode.Type;

/** Identifies a Blueprint graph node: a target key or an attached-module ID. */
const BlueprintNodeId = Schema.Union([
  TargetKey,
  BlueprintAttachedModuleNodeId,
]).check(Schema.isNonEmpty());

export type BlueprintNodeId = typeof BlueprintNodeId.Type;

export const blueprintNodeOrder = Order.mapInput(
  Order.combineAll<BlueprintNode>([
    Order.mapInput(Order.String, (node) => node._tag),
    Order.mapInput(Order.String, (node) => node.id),
  ]),
  (node: BlueprintNode) => node,
);

const BlueprintEdgeReason = Schema.Literals([
  "owns-module",
  "required-target",
  "required-module",
]);

export type BlueprintEdgeReason = typeof BlueprintEdgeReason.Type;

/**
 * Identifies a Blueprint edge. `makeBlueprintEdge` owns the
 * `<reason>=><from>=><to>` format.
 *
 * @category Blueprint
 * @since 1.0.0
 */
const BlueprintEdgeId = Schema.NonEmptyString.pipe(
  Schema.brand("BlueprintEdgeId"),
);

const BlueprintEdge = Schema.Struct({
  id: BlueprintEdgeId,
  from: BlueprintNodeId,
  to: BlueprintNodeId,
  reason: BlueprintEdgeReason,
});

export type BlueprintEdge = typeof BlueprintEdge.Type;

export const makeBlueprintEdge = (
  reason: BlueprintEdgeReason,
  from: BlueprintNodeId,
  to: BlueprintNodeId,
): BlueprintEdge => ({
  id: BlueprintEdgeId.make(`${reason}=>${from}=>${to}`),
  from,
  to,
  reason,
});

const BlueprintFields = Schema.Struct({
  nodes: Schema.Array(BlueprintNode),
  edges: Schema.Array(BlueprintEdge),
}).check(
  Schema.makeFilter((blueprint) => {
    const duplicateNodeIds = duplicates(
      blueprint.nodes.map((node) => node.id),
    ).map((id) => `Blueprint node id must be unique: ${id}`);
    const duplicateEdgeIds = duplicates(
      blueprint.edges.map((edge) => edge.id),
    ).map((id) => `Blueprint edge id must be unique: ${id}`);
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
  // fallow-ignore-next-line unused-class-member -- called by BlueprintResolver.resolve
  toSorted(): Blueprint {
    return new Blueprint({
      nodes: [...this.nodes].sort(blueprintNodeOrder),
      edges: [...this.edges].sort(edgeOrder),
    });
  }
}

export const toAttachedModuleNodeId = (
  targetId: TargetKey,
  moduleId: ModuleId,
): BlueprintAttachedModuleNodeId =>
  BlueprintAttachedModuleNodeId.make(`${targetId}#${moduleId}`);
