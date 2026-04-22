import { Data, Order, Schema } from "effect";
import {
  blueprintCauseOrd,
  blueprintDependencyEdgeOrd,
  blueprintWarningOrd,
  resolvedRepoModuleOrd,
  resolvedTargetModuleOrd,
  resolvedTargetOrd,
} from "./Order";
import {
  PackagePublicEntrypoint,
  RepoModuleId,
  TargetIdentity,
  TargetModuleId,
} from "./Scaffold";

export class BlueprintFailure extends Data.TaggedError("BlueprintFailure")<{
  message: string;
  cause?: unknown;
}> {}

export class CatalogNotFound extends Data.TaggedError("CatalogNotFound")<{
  catalog: "target" | "module";
  entity: "target-kind" | "repo-module" | "target-module";
  id: string;
}> {}

export const BlueprintNodeReference = Schema.Union([
  Schema.TaggedStruct("target", {
    id: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("repo-module", {
    id: RepoModuleId,
  }),
  Schema.TaggedStruct("target-module", {
    targetId: Schema.NonEmptyString,
    moduleId: TargetModuleId,
  }),
]);
export type BlueprintNodeReference = Schema.Schema.Type<
  typeof BlueprintNodeReference
>;

export const BlueprintCause = Schema.Union([
  Schema.TaggedStruct("selection", {
    source: BlueprintNodeReference,
  }),
  Schema.TaggedStruct("dependency", {
    edgeId: Schema.NonEmptyString,
  }),
]);
export type BlueprintCause = Schema.Schema.Type<typeof BlueprintCause>;

export const BlueprintStatus = Schema.Literals(["selected", "implied"]);
export type BlueprintStatus = Schema.Schema.Type<typeof BlueprintStatus>;

export const TargetComposition = Schema.Union([
  Schema.TaggedStruct("package", {
    publicEntrypoint: PackagePublicEntrypoint,
  }),
]);
export type TargetComposition = Schema.Schema.Type<typeof TargetComposition>;

export const ResolvedTargetModule = Schema.Struct({
  moduleId: TargetModuleId,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});
export type ResolvedTargetModule = Schema.Schema.Type<
  typeof ResolvedTargetModule
>;

export const ResolvedRepoModule = Schema.Struct({
  moduleId: RepoModuleId,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});
export type ResolvedRepoModule = Schema.Schema.Type<typeof ResolvedRepoModule>;

export const ResolvedTarget = Schema.Struct({
  id: Schema.NonEmptyString,
  identity: TargetIdentity,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
  targetModules: Schema.Array(ResolvedTargetModule),
  composition: Schema.optional(TargetComposition),
});
export type ResolvedTarget = Schema.Schema.Type<typeof ResolvedTarget>;

export const BlueprintEdgeReason = Schema.Literals([
  "required-owning-target",
  "required-repo-module",
  "required-canonical-target",
  "required-target-module",
]);
export type BlueprintEdgeReason = Schema.Schema.Type<
  typeof BlueprintEdgeReason
>;

export const BlueprintDependencyEdge = Schema.TaggedStruct("depends-on", {
  id: Schema.NonEmptyString,
  from: BlueprintNodeReference,
  to: BlueprintNodeReference,
  reason: BlueprintEdgeReason,
});
export type BlueprintDependencyEdge = Schema.Schema.Type<
  typeof BlueprintDependencyEdge
>;

export const BlueprintWarning = Schema.Union([
  Schema.TaggedStruct("RedundantSelectionNormalized", {
    node: BlueprintNodeReference,
    edgeIds: Schema.NonEmptyArray(Schema.NonEmptyString),
  }),
]);
export type BlueprintWarning = Schema.Schema.Type<typeof BlueprintWarning>;

export class Blueprint extends Schema.Class<Blueprint>("Blueprint")({
  nodes: Schema.Array(ResolvedTarget),
  edges: Schema.Array(BlueprintDependencyEdge),
  modules: Schema.Array(ResolvedRepoModule),
  warnings: Schema.Array(BlueprintWarning),
}) {
  toSorted(): Blueprint {
    return new Blueprint({
      nodes: [...this.nodes]
        .map((target) => ({
          ...target,
          causes: sortBlueprintCauses(target.causes),
          targetModules: [...target.targetModules]
            .map((targetModule) => ({
              ...targetModule,
              causes: sortBlueprintCauses(targetModule.causes),
            }))
            .sort(resolvedTargetModuleOrd),
        }))
        .sort(resolvedTargetOrd),
      edges: [...this.edges].sort(blueprintDependencyEdgeOrd),
      modules: [...this.modules]
        .map((repoModule) => ({
          ...repoModule,
          causes: sortBlueprintCauses(repoModule.causes),
        }))
        .sort(resolvedRepoModuleOrd),
      warnings: [...this.warnings]
        .map((warning) => ({
          ...warning,
          edgeIds: [...warning.edgeIds].sort(Order.String) as [
            string,
            ...Array<string>,
          ],
        }))
        .sort(blueprintWarningOrd),
    });
  }

  prettyPrint(): string {
    const lines: Array<string> = [
      "Blueprint",
      "",
      "Legend: [*] selected  [+] implied  ╌> owns  ─> depends on",
    ];
    const targetModuleStates = new Map<
      string,
      typeof ResolvedTargetModule.Type
    >();

    for (const target of this.nodes) {
      for (const targetModule of target.targetModules) {
        targetModuleStates.set(
          toTargetModuleStateKey(target.id, targetModule.moduleId),
          targetModule,
        );
      }
    }

    if (this.nodes.length > 0) {
      lines.push("", "Targets");

      for (const [index, target] of this.nodes.entries()) {
        lines.push(
          `${formatStatusBadge(target.status)} ${target.id} (${target.identity.kind})`,
        );

        const targetBranches: Array<TreeBranch> = [
          ...target.targetModules.map(
            (targetModule): TreeBranch => ({
              line: `${formatStatusBadge(targetModule.status)} ${target.id}/${targetModule.moduleId}`,
              prefix: "╌>",
              children: this.edges
                .filter(
                  (edge) =>
                    edge.from._tag === "target-module" &&
                    edge.from.targetId === target.id &&
                    edge.from.moduleId === targetModule.moduleId &&
                    edge.reason !== "required-owning-target",
                )
                .map(
                  (edge): TreeBranch => ({
                    line: `${formatReferencedNode(edge.to, this.nodes, this.modules, targetModuleStates)} ${formatEdgeReasonLabel(edge.reason)}`,
                    prefix: "─>",
                  }),
                ),
            }),
          ),
        ];

        if (target.composition?._tag === "package") {
          targetBranches.push({
            line: `composition: ${target.composition.publicEntrypoint}`,
            prefix: "╌>",
          });
        }

        targetBranches.push(
          ...this.edges
            .filter(
              (edge) =>
                edge.from._tag === "target" && edge.from.id === target.id,
            )
            .map(
              (edge): TreeBranch => ({
                line: `${formatReferencedNode(edge.to, this.nodes, this.modules, targetModuleStates)} ${formatEdgeReasonLabel(edge.reason)}`,
                prefix: "─>",
              }),
            ),
        );

        appendTreeBranches(lines, targetBranches);

        if (index < this.nodes.length - 1) {
          lines.push("");
        }
      }
    }

    if (this.modules.length > 0) {
      lines.push("", "Repo Modules");

      for (const module of this.modules) {
        lines.push(`${formatStatusBadge(module.status)} ${module.moduleId}`);
      }
    }

    if (this.warnings.length > 0) {
      lines.push("", "Warnings");

      for (const warning of this.warnings) {
        lines.push(...formatWarningLines(warning));
      }
    }

    return lines.join("\n");
  }

  hasTarget(targetId: string): boolean {
    return this.nodes.some((target) => target.id === targetId);
  }

  getTarget(targetId: string): typeof ResolvedTarget.Type | undefined {
    return this.nodes.find((target) => target.id === targetId);
  }

  getSelectedTargets(): Array<typeof ResolvedTarget.Type> {
    return this.nodes.filter((target) => target.status === "selected");
  }

  getImpliedTargets(): Array<typeof ResolvedTarget.Type> {
    return this.nodes.filter((target) => target.status === "implied");
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }
}

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
        `${indent}${isLast ? "   " : " │   "}`,
      );
    }
  }
};

const formatWarningLines = (
  warning: typeof BlueprintWarning.Type,
): Array<string> => {
  switch (warning._tag) {
    case "RedundantSelectionNormalized":
      return [
        `! ${formatNodeReference(warning.node)} also implied by:`,
        ...warning.edgeIds.map((edgeId) => `  ${edgeId}`),
      ];
  }
};

const formatStatusBadge = (status: typeof BlueprintStatus.Type): string =>
  status === "selected" ? "[*]" : "[+]";

const formatEdgeReasonLabel = (
  reason: typeof BlueprintEdgeReason.Type,
): string => {
  switch (reason) {
    case "required-canonical-target":
      return "[canonical-target]";
    case "required-owning-target":
      return "[owning-target]";
    case "required-repo-module":
      return "[repo-module]";
    case "required-target-module":
      return "[target-module]";
  }
};

const formatReferencedNode = (
  reference: typeof BlueprintNodeReference.Type,
  targets: ReadonlyArray<typeof ResolvedTarget.Type>,
  repoModules: ReadonlyArray<typeof ResolvedRepoModule.Type>,
  targetModules: ReadonlyMap<string, typeof ResolvedTargetModule.Type>,
): string => {
  switch (reference._tag) {
    case "repo-module": {
      const repoModule = repoModules.find(
        (module) => module.moduleId === reference.id,
      );
      return `${formatStatusBadge(repoModule?.status ?? "implied")} ${reference.id}`;
    }
    case "target": {
      const target = targets.find((node) => node.id === reference.id);
      return `${formatStatusBadge(target?.status ?? "implied")} ${reference.id}`;
    }
    case "target-module": {
      const targetModule = targetModules.get(
        toTargetModuleStateKey(reference.targetId, reference.moduleId),
      );
      return `${formatStatusBadge(targetModule?.status ?? "implied")} ${reference.targetId}/${reference.moduleId}`;
    }
  }
};

const toTargetModuleStateKey = (targetId: string, moduleId: string): string =>
  `${targetId}:${moduleId}`;

const formatNodeReference = (
  reference: typeof BlueprintNodeReference.Type,
): string => {
  switch (reference._tag) {
    case "repo-module":
      return `repo-module:${reference.id}`;
    case "target":
      return `target:${reference.id}`;
    case "target-module":
      return `target-module:${reference.targetId}/${reference.moduleId}`;
  }
};

const sortBlueprintCauses = (
  causes: ReadonlyArray<BlueprintCause>,
): [BlueprintCause, ...Array<BlueprintCause>] =>
  [...causes].sort(blueprintCauseOrd) as [
    BlueprintCause,
    ...Array<BlueprintCause>,
  ];
