import { Order } from "effect";
import type { BlueprintEdge, BlueprintNode } from "./Blueprint";
import type { PlanConflict } from "./Plan";

export const pathStrOrd = Order.mapInput(
  Order.Array(Order.String),
  (path: string) => path.split("/"),
);

export const pathOrd = Order.mapInput(
  pathStrOrd,
  (input: { path: string }) => input.path,
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
