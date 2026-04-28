import { Data, Order, Schema } from "effect";
import { idOrd } from "./Order";
import { ModuleId, TargetIdentity, TargetKey } from "./Scaffold";

export class BlueprintFailure extends Data.TaggedError("BlueprintFailure")<{
  message: string;
  cause?: unknown;
}> {}

export class CatalogNotFound extends Data.TaggedError("CatalogNotFound")<{
  catalog: "target" | "module";
  entity: "target-kind" | "module";
  id: string;
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

export const blueprintNodeOrd = Order.mapInput(
  Order.combineAll<(typeof Blueprint.fields.nodes.Type)[0]>([
    Order.mapInput(Order.String, (node) => node._tag),
    Order.mapInput(Order.String, (node) => node.id),
  ]),
  (node: (typeof Blueprint.fields.nodes.Type)[0]) => node,
);

export class Blueprint extends Schema.Class<Blueprint>("Blueprint")({
  nodes: Schema.Array(
    Schema.Union([BlueprintTargetNode, BlueprintAttachedModuleNode]),
  ),
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
        isBlueprintTargetNode(node) && node.id === targetId,
    );
  }

  getTarget(targetId: string): typeof BlueprintTargetNode.Type | undefined {
    return this.nodes.find(
      (node): node is typeof BlueprintTargetNode.Type =>
        isBlueprintTargetNode(node) && node.id === targetId,
    );
  }
}

export const isBlueprintTargetNode = (
  node: (typeof Blueprint.fields.nodes.Type)[0],
): node is typeof BlueprintTargetNode.Type => node._tag === "target";

export const isBlueprintAttachedModuleNode = (
  node: (typeof Blueprint.fields.nodes.Type)[0],
): node is typeof BlueprintAttachedModuleNode.Type =>
  node._tag === "attached-module";

export const toAttachedModuleNodeId = (
  targetId: typeof TargetKey.Type,
  moduleId: typeof ModuleId.Type,
): typeof BlueprintAttachedModuleNode.fields.id.Type =>
  `${targetId}#${moduleId}`;
