import { Data, Order, Schema } from "effect";
import {
  CatalogNotFound,
  ModuleId,
  TargetIdentity,
  TargetKey,
} from "./Catalog";
import { idOrd } from "./Order";

export { CatalogNotFound };

export class BlueprintFailure extends Data.TaggedError("BlueprintFailure")<{
  message: string;
  cause?: unknown;
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
export class Blueprint extends Schema.Class<Blueprint>("Blueprint")({
  nodes: Schema.Array(BlueprintNode),
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
}) {
  toSorted(): Blueprint {
    return new Blueprint({
      nodes: [...this.nodes].sort(blueprintNodeOrd),
      edges: [...this.edges].sort(idOrd),
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
