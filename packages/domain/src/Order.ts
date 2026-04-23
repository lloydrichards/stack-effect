import { Order } from "effect";
import type { BlueprintEdge, BlueprintNode } from "./Blueprint";
import type { PlanConflict, PlanEntry, PlanTreeNode } from "./Plan";
import type { TargetIdentity } from "./Scaffold";

const pathPartsOrd = Order.Array(Order.String);

export const toTargetPath = (identity: TargetIdentity): string =>
  identity.kind === "package"
    ? `packages/${identity.name}`
    : `apps/${identity.kind}-${identity.name}`;

export const pathOrd = Order.mapInput(pathPartsOrd, (path: string) =>
  path.split("/"),
);

export const targetIdentityOrd = Order.mapInput(
  Order.String,
  (identity: TargetIdentity) => toTargetPath(identity),
);

export const blueprintNodeOrd = Order.mapInput(
  Order.combineAll([
    Order.mapInput(Order.String, (node: BlueprintNode) => node._tag),
    Order.mapInput(Order.String, (node: BlueprintNode) => node.id),
  ]),
  (node: BlueprintNode) => node,
);

export const blueprintEdgeOrd = Order.mapInput(
  Order.String,
  (edge: BlueprintEdge) => edge.id,
);

const toPlanConflictKey = (conflict: PlanConflict): string => {
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
};

export const planEntryOrd = Order.mapInput(
  pathOrd,
  (entry: PlanEntry) => entry.path,
);

export const planTreeNodeOrd = Order.combineAll([
  Order.mapInput(Order.String, (node: PlanTreeNode) => node._tag),
  Order.mapInput(Order.String, (node: PlanTreeNode) => node.name),
  Order.mapInput(pathOrd, (node: PlanTreeNode) => node.path),
]);

export const planConflictOrd = Order.mapInput(Order.String, toPlanConflictKey);
