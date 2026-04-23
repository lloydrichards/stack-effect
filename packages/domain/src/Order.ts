import { Order } from "effect";
import type { BlueprintEdge, BlueprintNode } from "./Blueprint";
import type { PlanConflict, PlanEntry, PlanTreeNode } from "./Plan";
import type { TargetIdentity } from "./Scaffold";

export const pathOrd = Order.mapInput(
  Order.Array(Order.String),
  (path: string) => path.split("/"),
);

export const targetIdentityOrd = Order.mapInput(
  Order.String,
  (identity: TargetIdentity) => identity.toPath(),
);

export const blueprintNodeOrd = Order.mapInput(
  Order.combineAll<BlueprintNode>([
    Order.mapInput(Order.String, (node) => node._tag),
    Order.mapInput(Order.String, (node) => node.id),
  ]),
  (node: BlueprintNode) => node,
);

export const blueprintEdgeOrd = Order.mapInput(
  Order.String,
  (edge: BlueprintEdge) => edge.id,
);

export const planEntryOrd = Order.mapInput(
  pathOrd,
  (entry: PlanEntry) => entry.path,
);

export const planTreeNodeOrd = Order.combineAll<PlanTreeNode>([
  Order.mapInput(Order.String, (node) => node._tag),
  Order.mapInput(Order.String, (node) => node.name),
  Order.mapInput(pathOrd, (node) => node.path),
]);

export const planConflictOrd = Order.mapInput(
  Order.String,
  (conflict: PlanConflict): string => {
    switch (conflict._tag) {
      case "packageJsonExports":
        return `packageJsonExports:${conflict.path}:${conflict.exportKey}`;
      case "packageJsonDependencies":
        return `packageJsonDependencies:${conflict.path}:${conflict.section}:${conflict.dependencyName}`;
      case "packageJsonScripts":
        return `packageJsonScripts:${conflict.path}:${conflict.scriptName}`;
      case "barrelExport":
        return `barrelExport:${conflict.path}:${conflict.exportPath}`;
      case "tsconfig":
        return `tsconfig:${conflict.path}`;
      case "authoritativeFile":
        return `authoritativeFile:${conflict.path}`;
    }
  },
);
