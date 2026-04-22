import { Order } from "effect";
import type {
  BlueprintCause,
  BlueprintDependencyEdge,
  BlueprintNodeReference,
  BlueprintWarning,
  ResolvedRepoModule,
  ResolvedTarget,
  ResolvedTargetModule,
} from "./Blueprint";
import type {
  MergeRequirement,
  PlanCause,
  PlanEntry,
  PlanTreeNode,
  PlanWarning,
} from "./Plan";
import type { TargetIdentity } from "./Scaffold";

const pathPartsOrd = Order.Array(Order.String);

const toTargetId = (identity: typeof TargetIdentity.Type): string =>
  identity.kind === "package"
    ? `packages/${identity.name}`
    : `apps/${identity.kind}-${identity.name}`;

const toBlueprintNodeReferenceKey = (
  reference: BlueprintNodeReference,
): string => {
  switch (reference._tag) {
    case "target":
      return `target:${reference.id}`;
    case "repo-module":
      return `repo-module:${reference.id}`;
    case "target-module":
      return `target-module:${reference.targetId}:${reference.moduleId}`;
  }
};

const toBlueprintCauseKey = (cause: BlueprintCause): string => {
  switch (cause._tag) {
    case "selection":
      return `selection:${toBlueprintNodeReferenceKey(cause.source)}`;
    case "dependency":
      return `dependency:${cause.edgeId}`;
  }
};

export const toPlanCauseKey = (cause: PlanCause): string => {
  switch (cause._tag) {
    case "selectedTarget":
      return `selectedTarget:${cause.targetId}`;
    case "selectedRepoModule":
      return `selectedRepoModule:${cause.moduleId}`;
    case "impliedTarget":
      return `impliedTarget:${cause.targetId}:${cause.via}`;
    case "impliedTargetModule":
      return `impliedTargetModule:${cause.targetId}:${cause.moduleId}:${cause.via}`;
    case "targetComposition":
      return `targetComposition:${cause.targetId}:${cause.slot}:${cause.value}`;
  }
};

const toMergeRequirementKey = (requirement: MergeRequirement): string => {
  switch (requirement._tag) {
    case "packageJsonExports":
      return `packageJsonExports:${requirement.path}:${requirement.exportKey}`;
    case "packageJsonDependencies":
      return `packageJsonDependencies:${requirement.path}:${requirement.section}:${requirement.dependencyName}`;
    case "packageJsonScripts":
      return `packageJsonScripts:${requirement.path}:${requirement.scriptName}`;
    case "barrelExport":
      return `barrelExport:${requirement.path}:${requirement.exportPath}`;
    case "tsconfig":
      return `tsconfig:${requirement.path}`;
    case "authoritativeFile":
      return `authoritativeFile:${requirement.path}`;
  }
};

const toPlanWarningKey = (warning: PlanWarning): string => {
  switch (warning._tag) {
    case "impliedDependency":
      return `impliedDependency:${warning.path}:${warning.message}`;
    case "mergeStrategyRequired":
      return `mergeStrategyRequired:${warning.path}:${toMergeRequirementKey(warning.requirement)}`;
  }
};

export const pathOrd = Order.mapInput(pathPartsOrd, (path: string) =>
  path.split("/"),
);

export const targetIdentityOrd = Order.mapInput(
  Order.String,
  (identity: typeof TargetIdentity.Type) => toTargetId(identity),
);

export const blueprintNodeReferenceOrd = Order.mapInput(
  Order.String,
  toBlueprintNodeReferenceKey,
);

export const blueprintCauseOrd = Order.mapInput(
  Order.String,
  toBlueprintCauseKey,
);

export const blueprintDependencyEdgeOrd = Order.mapInput(
  Order.String,
  (edge: BlueprintDependencyEdge) => edge.id,
);

export const resolvedTargetOrd = Order.mapInput(
  Order.String,
  (target: ResolvedTarget) => target.id,
);

export const resolvedTargetModuleOrd = Order.mapInput(
  Order.String,
  (targetModule: ResolvedTargetModule) => targetModule.moduleId,
);

export const resolvedRepoModuleOrd = Order.mapInput(
  Order.String,
  (repoModule: ResolvedRepoModule) => repoModule.moduleId,
);

export const blueprintWarningOrd = Order.mapInput(
  blueprintNodeReferenceOrd,
  (warning: BlueprintWarning) => warning.node,
);

export const planCauseOrd = Order.mapInput(Order.String, toPlanCauseKey);

export const planEntryOrd = Order.mapInput(
  pathOrd,
  (entry: PlanEntry) => entry.path,
);

export const planTreeNodeOrd = Order.combineAll([
  Order.mapInput(Order.String, (node: PlanTreeNode) => node._tag),
  Order.mapInput(Order.String, (node: PlanTreeNode) => node.name),
  Order.mapInput(pathOrd, (node: PlanTreeNode) => node.path),
]);

export const mergeRequirementOrd = Order.mapInput(
  Order.String,
  toMergeRequirementKey,
);

export const planWarningOrd = Order.mapInput(Order.String, toPlanWarningKey);
