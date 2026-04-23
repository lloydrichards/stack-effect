import { Data, Order, Schema } from "effect";
import { blueprintEdgeOrd, blueprintNodeOrd } from "./Order";
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

export const BlueprintNodeId = Schema.NonEmptyString;
export type BlueprintNodeId = Schema.Schema.Type<typeof BlueprintNodeId>;

export const AttachedModuleNodeId = Schema.TemplateLiteral([
  TargetKey,
  "#",
  ModuleId,
]);
export type AttachedModuleNodeId = Schema.Schema.Type<
  typeof AttachedModuleNodeId
>;

export const BlueprintTargetNode = Schema.TaggedStruct("target", {
  id: TargetKey,
  identity: TargetIdentity,
});
export type BlueprintTargetNode = Schema.Schema.Type<typeof BlueprintTargetNode>;

export const BlueprintAttachedModuleNode = Schema.TaggedStruct(
  "attached-module",
  {
    id: AttachedModuleNodeId,
    targetId: TargetKey,
    moduleId: ModuleId,
  },
);
export type BlueprintAttachedModuleNode = Schema.Schema.Type<
  typeof BlueprintAttachedModuleNode
>;

export const BlueprintNode = Schema.Union([
  BlueprintTargetNode,
  BlueprintAttachedModuleNode,
]);
export type BlueprintNode = Schema.Schema.Type<typeof BlueprintNode>;

export const BlueprintEdgeReason = Schema.Literals([
  "owns-module",
  "required-target",
  "required-module",
]);
export type BlueprintEdgeReason = Schema.Schema.Type<
  typeof BlueprintEdgeReason
>;

export const BlueprintEdge = Schema.Struct({
  id: Schema.NonEmptyString,
  from: BlueprintNodeId,
  to: BlueprintNodeId,
  reason: BlueprintEdgeReason,
});
export type BlueprintEdge = Schema.Schema.Type<typeof BlueprintEdge>;

export class Blueprint extends Schema.Class<Blueprint>("Blueprint")({
  nodes: Schema.Array(BlueprintNode),
  edges: Schema.Array(BlueprintEdge),
}) {
  toSorted(): Blueprint {
    return new Blueprint({
      nodes: [...this.nodes].sort(blueprintNodeOrd),
      edges: [...this.edges].sort(blueprintEdgeOrd),
    });
  }

  prettyPrint(): string {
    const lines: Array<string> = ["Blueprint"];

    if (this.nodes.length === 0) {
      return lines.join("\n");
    }

    const targetNodes = this.nodes.filter(isBlueprintTargetNode);
    const attachedModuleNodes = this.nodes.filter(isBlueprintAttachedModuleNode);
    const attachedModulesByTarget = new Map<string, Array<BlueprintAttachedModuleNode>>();
    const outgoingEdgesByNode = new Map<string, Array<BlueprintEdge>>();

    for (const node of attachedModuleNodes) {
      const modules = attachedModulesByTarget.get(node.targetId) ?? [];
      modules.push(node);
      attachedModulesByTarget.set(node.targetId, modules);
    }

    for (const edge of this.edges) {
      const edges = outgoingEdgesByNode.get(edge.from) ?? [];
      edges.push(edge);
      outgoingEdgesByNode.set(edge.from, edges);
    }

    lines.push("", "Targets");

    for (const targetNode of targetNodes) {
      lines.push(`- ${targetNode.id} (${targetNode.identity.kind})`);

      const branches = [...(attachedModulesByTarget.get(targetNode.id) ?? [])]
        .sort(blueprintNodeOrd)
        .map((attachedModule) => ({
          line: attachedModule.id,
          prefix: "╌>",
          children: [...(outgoingEdgesByNode.get(attachedModule.id) ?? [])]
            .filter((edge) => edge.reason !== "owns-module")
            .sort(blueprintEdgeOrd)
            .map((edge) => ({
              line: `${edge.to} [${edge.reason}]`,
              prefix: "─>",
            })),
        } satisfies TreeBranch));

      appendTreeBranches(lines, branches);
    }

    return lines.join("\n");
  }

  hasTarget(targetId: string): boolean {
    return this.nodes.some(
      (node): node is BlueprintTargetNode =>
        isBlueprintTargetNode(node) && node.id === targetId,
    );
  }

  getTarget(targetId: string): BlueprintTargetNode | undefined {
    return this.nodes.find(
      (node): node is BlueprintTargetNode =>
        isBlueprintTargetNode(node) && node.id === targetId,
    );
  }
}

export const isBlueprintTargetNode = (
  node: BlueprintNode,
): node is BlueprintTargetNode => node._tag === "target";

export const isBlueprintAttachedModuleNode = (
  node: BlueprintNode,
): node is BlueprintAttachedModuleNode => node._tag === "attached-module";

export const toAttachedModuleNodeId = (
  targetId: TargetKey,
  moduleId: ModuleId,
): AttachedModuleNodeId => `${targetId}#${moduleId}`;

type TreeBranch = {
  readonly line: string;
  readonly prefix: "╌>" | "─>";
  readonly children?: ReadonlyArray<TreeBranch>;
};

const appendTreeBranches = (
  lines: Array<string>,
  branches: ReadonlyArray<TreeBranch>,
  indent = "",
): void => {
  for (const [index, branch] of branches.entries()) {
    const isLast = index === branches.length - 1;
    const connector = isLast ? " └" : " ├";
    lines.push(`${indent}${connector}${branch.prefix} ${branch.line}`);

    if (branch.children !== undefined && branch.children.length > 0) {
      appendTreeBranches(
        lines,
        branch.children,
        `${indent}${isLast ? "     " : " │     "}`,
      );
    }
  }
};
