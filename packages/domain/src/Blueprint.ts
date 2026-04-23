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

export const AttachedModule = Schema.Struct({
  moduleId: ModuleId,
});
export type AttachedModule = Schema.Schema.Type<typeof AttachedModule>;

export const BlueprintTargetNode = Schema.TaggedStruct("target", {
  id: TargetKey,
  identity: TargetIdentity,
  modules: Schema.Array(AttachedModule),
});
export type BlueprintTargetNode = Schema.Schema.Type<
  typeof BlueprintTargetNode
>;

export const BlueprintNode = Schema.Union([BlueprintTargetNode]);
export type BlueprintNode = Schema.Schema.Type<typeof BlueprintNode>;

export const BlueprintEdgeReason = Schema.Literals([
  "required-target",
  "required-module",
]);
export type BlueprintEdgeReason = Schema.Schema.Type<
  typeof BlueprintEdgeReason
>;

export const BlueprintEdge = Schema.Struct({
  id: Schema.NonEmptyString,
  from: Schema.NonEmptyString,
  to: Schema.NonEmptyString,
  reason: BlueprintEdgeReason,
});
export type BlueprintEdge = Schema.Schema.Type<typeof BlueprintEdge>;

export class Blueprint extends Schema.Class<Blueprint>("Blueprint")({
  nodes: Schema.Array(BlueprintNode),
  edges: Schema.Array(BlueprintEdge),
  roots: Schema.Array(Schema.NonEmptyString),
}) {
  toSorted(): Blueprint {
    return new Blueprint({
      nodes: [...this.nodes]
        .map((node) => ({
          ...node,
          modules: [...node.modules].sort(attachedModuleOrd),
        }))
        .sort(blueprintNodeOrd),
      edges: [...this.edges].sort(blueprintEdgeOrd),
      roots: [...this.roots].sort(Order.String),
    });
  }

  prettyPrint(): string {
    const lines: Array<string> = [
      "Blueprint",
      "",
      "Legend: [*] root  [+] implied",
    ];
    const rootSet = new Set(this.roots);
    const nodesById = new Map(
      this.nodes.map((node) => [node.id, node] as const),
    );

    if (this.nodes.length === 0) {
      return lines.join("\n");
    }

    lines.push("", "Targets");

    for (const node of this.nodes) {
      lines.push(
        `${rootSet.has(node.id) ? "[*]" : "[+]"} ${node.id} (${node.identity.kind})`,
      );

      const branches: Array<TreeBranch> = [];

      for (const module of node.modules) {
        const moduleId = toModuleNodeId(node.id, module.moduleId);
        const outgoingEdges = this.edges.filter(
          (edge) => edge.from === moduleId,
        );

        branches.push({
          line: `${rootSet.has(moduleId) ? "[*]" : "[+]"} ${moduleId}`,
          prefix: "╌>",
          children: outgoingEdges.map((edge) => {
            const referencedNode = nodesById.get(edge.to);
            const label = referencedNode === undefined ? edge.to : `${edge.to}`;

            return {
              line: `${rootSet.has(edge.to) ? "[*]" : "[+]"} ${label} [${edge.reason}]`,
              prefix: "─>",
            } satisfies TreeBranch;
          }),
        });
      }

      appendTreeBranches(lines, branches);
    }

    return lines.join("\n");
  }

  hasTarget(targetId: string): boolean {
    return this.nodes.some((node) => node.id === targetId);
  }

  getTarget(targetId: string): BlueprintTargetNode | undefined {
    return this.nodes.find((node) => node.id === targetId);
  }

  getRootTargets(): Array<BlueprintTargetNode> {
    const rootSet = new Set(this.roots);
    return this.nodes.filter((node) => rootSet.has(node.id));
  }
}

const attachedModuleOrd = Order.mapInput(
  Order.String,
  (module: AttachedModule) => module.moduleId,
);

export const toModuleNodeId = (targetId: string, moduleId: ModuleId) =>
  `${targetId}#${moduleId}`;

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
