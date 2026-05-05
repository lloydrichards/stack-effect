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

export const BlueprintTargetNode = Schema.TaggedStruct("target", {
  id: TargetKey,
  identity: TargetIdentity,
});

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
