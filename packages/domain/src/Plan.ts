import { Schema } from "effect";
import type {
  BlueprintCause,
  ResolvedRepoModule,
  ResolvedTarget,
  ResolvedTargetModule,
  TargetComposition,
} from "./Blueprint";
import {
  mergeRequirementOrd,
  planCauseOrd,
  planEntryOrd,
  planTreeNodeOrd,
  planWarningOrd,
  toPlanCauseKey,
} from "./Order";

export const PlanEntryClassification = Schema.Literals([
  "create",
  "modify",
  "unchanged",
  "needsMergeStrategy",
]);
export type PlanEntryClassification = Schema.Schema.Type<
  typeof PlanEntryClassification
>;

export const PlanCause = Schema.Union([
  Schema.TaggedStruct("selectedTarget", {
    targetId: Schema.String,
  }),
  Schema.TaggedStruct("selectedRepoModule", {
    moduleId: Schema.String,
  }),
  Schema.TaggedStruct("impliedTarget", {
    targetId: Schema.String,
    via: Schema.String,
  }),
  Schema.TaggedStruct("impliedTargetModule", {
    targetId: Schema.String,
    moduleId: Schema.String,
    via: Schema.String,
  }),
  Schema.TaggedStruct("targetComposition", {
    targetId: Schema.String,
    slot: Schema.String,
    value: Schema.String,
  }),
]);
export type PlanCause = Schema.Schema.Type<typeof PlanCause>;

export const RepoSnapshotPath = Schema.Union([
  Schema.TaggedStruct("missing", {
    path: Schema.String,
  }),
  Schema.TaggedStruct("directory", {
    path: Schema.String,
  }),
  Schema.TaggedStruct("file", {
    path: Schema.String,
    contents: Schema.String,
  }),
]);
export type RepoSnapshotPath = Schema.Schema.Type<typeof RepoSnapshotPath>;

export const RepoSnapshot = Schema.Struct({
  paths: Schema.Array(RepoSnapshotPath),
});
export type RepoSnapshot = Schema.Schema.Type<typeof RepoSnapshot>;

export class PlanFailure extends Schema.TaggedErrorClass<PlanFailure>()(
  "PlanFailure",
  {
    reason: Schema.Literals(["repoRootNotEmpty", "invalidChangeset"]),
    message: Schema.String,
  },
) {}

export const MergeRequirement = Schema.Union([
  Schema.TaggedStruct("packageJsonExports", {
    path: Schema.String,
    exportKey: Schema.String,
    causes: Schema.NonEmptyArray(PlanCause),
  }),
  Schema.TaggedStruct("packageJsonDependencies", {
    path: Schema.String,
    section: Schema.String,
    dependencyName: Schema.String,
    causes: Schema.NonEmptyArray(PlanCause),
  }),
  Schema.TaggedStruct("packageJsonScripts", {
    path: Schema.String,
    scriptName: Schema.String,
    causes: Schema.NonEmptyArray(PlanCause),
  }),
  Schema.TaggedStruct("barrelExport", {
    path: Schema.String,
    exportPath: Schema.String,
    causes: Schema.NonEmptyArray(PlanCause),
  }),
  Schema.TaggedStruct("tsconfig", {
    path: Schema.String,
    causes: Schema.NonEmptyArray(PlanCause),
  }),
  Schema.TaggedStruct("authoritativeFile", {
    path: Schema.String,
    causes: Schema.NonEmptyArray(PlanCause),
  }),
]);
export type MergeRequirement = Schema.Schema.Type<typeof MergeRequirement>;

export const PlanWarning = Schema.Union([
  Schema.TaggedStruct("impliedDependency", {
    path: Schema.String,
    message: Schema.String,
    causes: Schema.NonEmptyArray(PlanCause),
  }),
  Schema.TaggedStruct("mergeStrategyRequired", {
    path: Schema.String,
    message: Schema.String,
    requirement: MergeRequirement,
  }),
]);
export type PlanWarning = Schema.Schema.Type<typeof PlanWarning>;

export const PlanFileEntry = Schema.Struct({
  _tag: Schema.Literal("file"),
  path: Schema.String,
  classification: PlanEntryClassification,
  causes: Schema.NonEmptyArray(PlanCause),
});
export type PlanFileEntry = Schema.Schema.Type<typeof PlanFileEntry>;

export const PlanDirectoryEntry = Schema.Struct({
  _tag: Schema.Literal("directory"),
  path: Schema.String,
  causes: Schema.NonEmptyArray(PlanCause),
});
export type PlanDirectoryEntry = Schema.Schema.Type<typeof PlanDirectoryEntry>;

export const PlanEntry = Schema.Union([PlanFileEntry, PlanDirectoryEntry]);
export type PlanEntry = Schema.Schema.Type<typeof PlanEntry>;

export const PlanTreeFileNode = Schema.Struct({
  _tag: Schema.Literal("file"),
  name: Schema.String,
  path: Schema.String,
  classification: PlanEntryClassification,
  causes: Schema.NonEmptyArray(PlanCause),
});
export type PlanTreeFileNode = Schema.Schema.Type<typeof PlanTreeFileNode>;

export interface PlanTreeDirectoryNode {
  readonly _tag: "directory";
  readonly name: string;
  readonly path: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
  readonly children: ReadonlyArray<PlanTreeNode>;
}

export type PlanTreeNode = PlanTreeFileNode | PlanTreeDirectoryNode;

export const PlanTreeDirectoryNode = Schema.Struct({
  _tag: Schema.Literal("directory"),
  name: Schema.String,
  path: Schema.String,
  causes: Schema.NonEmptyArray(PlanCause),
  children: Schema.Array(Schema.suspend(() => PlanTreeNode)),
}) as Schema.Schema<PlanTreeDirectoryNode>;

export const PlanTreeNode = Schema.Union([
  PlanTreeFileNode,
  Schema.suspend(() => PlanTreeDirectoryNode),
]);
export type PlanTreeNodeSchema = Schema.Schema.Type<typeof PlanTreeNode>;

export class Plan extends Schema.Class<Plan>("Plan")({
  entries: Schema.Array(PlanEntry),
  tree: PlanTreeDirectoryNode,
  mergeRequirements: Schema.Array(MergeRequirement),
  warnings: Schema.Array(PlanWarning),
}) {
  prettyPrint(): string {
    const summary = countPlanClassifications(this.tree);
    const mergeRequirementsByPath = groupMergeRequirementsByPath(
      this.mergeRequirements,
    );
    const lines: Array<string> = [
      "Plan",
      "",
      "Legend: [+] create  [~] modify  [=] unchanged  [!] needs merge",
      "",
      `Summary: ${summary.create} create  ${summary.modify} modify  ${summary.unchanged} unchanged  ${summary.needsMergeStrategy} merge`,
      "",
      this.tree.name,
    ];

    appendPlanTreeChildren(lines, this.tree.children, mergeRequirementsByPath);

    const warningLines = this.warnings.flatMap(formatPlanWarningLines);

    if (warningLines.length > 0) {
      lines.push("", "Warnings", ...warningLines);
    }

    return lines.join("\n");
  }

  toSorted(): Plan {
    return new Plan({
      entries: [...this.entries]
        .map((entry) => ({
          ...entry,
          causes: sortPlanCauses(entry.causes),
        }))
        .sort(planEntryOrd),
      tree: sortPlanTreeDirectoryNode(this.tree),
      mergeRequirements: [...this.mergeRequirements]
        .map(sortMergeRequirement)
        .sort(mergeRequirementOrd),
      warnings: [...this.warnings].map(sortPlanWarning).sort(planWarningOrd),
    });
  }
}

const sortPlanCauses = (
  causes: ReadonlyArray<PlanCause>,
): [PlanCause, ...Array<PlanCause>] =>
  [...causes].sort(planCauseOrd) as [PlanCause, ...Array<PlanCause>];

export const mergePlanCauses = (
  first: ReadonlyArray<PlanCause>,
  second: ReadonlyArray<PlanCause>,
): [PlanCause, ...Array<PlanCause>] => {
  const merged = new Map<string, PlanCause>();

  for (const cause of [...first, ...second]) {
    merged.set(toPlanCauseKey(cause), cause);
  }

  return sortPlanCauses([...merged.values()]);
};

export const toPlanTargetCauses = ({
  target,
}: {
  target: ResolvedTarget;
}): [PlanCause, ...Array<PlanCause>] =>
  sortPlanCauses(
    target.causes.map((cause): PlanCause => {
      switch (cause._tag) {
        case "selection":
          return {
            _tag: "selectedTarget",
            targetId: target.id,
          } satisfies PlanCause;
        case "dependency":
          return {
            _tag: "impliedTarget",
            targetId: target.id,
            via: cause.edgeId,
          } satisfies PlanCause;
        default:
          return cause satisfies never;
      }
    }),
  );

export const toPlanTargetModuleCauses = ({
  targetId,
  targetModule,
}: {
  targetId: string;
  targetModule: ResolvedTargetModule;
}): [PlanCause, ...Array<PlanCause>] =>
  sortPlanCauses(
    targetModule.causes.map((cause) => ({
      _tag: "impliedTargetModule",
      targetId,
      moduleId: targetModule.moduleId,
      via:
        cause._tag === "dependency"
          ? cause.edgeId
          : `${targetId}:${targetModule.moduleId}`,
    })),
  );

export const toPlanRepoModuleCauses = ({
  repoModule,
}: {
  repoModule: ResolvedRepoModule;
}): [PlanCause, ...Array<PlanCause>] =>
  sortPlanCauses(
    repoModule.causes.map(() => ({
      _tag: "selectedRepoModule",
      moduleId: repoModule.moduleId,
    })),
  );

export const toPlanTargetCompositionCauses = ({
  target,
  composition,
}: {
  target: ResolvedTarget;
  composition: TargetComposition;
}): [PlanCause, ...Array<PlanCause>] => {
  switch (composition._tag) {
    case "package":
      return [
        {
          _tag: "targetComposition",
          targetId: target.id,
          slot: "public-entrypoint",
          value: composition.publicEntrypoint,
        },
      ];
  }
};

export const isBlueprintCauseSelected = (cause: BlueprintCause): boolean =>
  cause._tag === "selection";

const sortPlanTreeDirectoryNode = (
  node: PlanTreeDirectoryNode,
): PlanTreeDirectoryNode => ({
  ...node,
  causes: sortPlanCauses(node.causes),
  children: [...node.children].map(sortPlanTreeNode).sort(planTreeNodeOrd),
});

const sortPlanTreeNode = (node: PlanTreeNode): PlanTreeNode => {
  switch (node._tag) {
    case "directory":
      return sortPlanTreeDirectoryNode(node);
    case "file":
      return {
        ...node,
        causes: sortPlanCauses(node.causes),
      };
  }
};

const sortMergeRequirement = (
  requirement: MergeRequirement,
): MergeRequirement => ({
  ...requirement,
  causes: sortPlanCauses(requirement.causes),
});

const sortPlanWarning = (warning: PlanWarning): PlanWarning => {
  switch (warning._tag) {
    case "impliedDependency":
      return {
        ...warning,
        causes: sortPlanCauses(warning.causes),
      };
    case "mergeStrategyRequired":
      return {
        ...warning,
        requirement: sortMergeRequirement(warning.requirement),
      };
  }
};

type PlanClassificationSummary = Record<PlanEntryClassification, number>;

const countPlanClassifications = (
  node: PlanTreeDirectoryNode,
): PlanClassificationSummary => {
  const summary: PlanClassificationSummary = {
    create: 0,
    modify: 0,
    unchanged: 0,
    needsMergeStrategy: 0,
  };

  const visit = (current: PlanTreeNode): void => {
    switch (current._tag) {
      case "directory": {
        for (const child of current.children) {
          visit(child);
        }
        return;
      }
      case "file": {
        summary[current.classification] += 1;
      }
    }
  };

  visit(node);

  return summary;
};

const appendPlanTreeChildren = (
  lines: Array<string>,
  nodes: ReadonlyArray<PlanTreeNode>,
  mergeRequirementsByPath: ReadonlyMap<string, ReadonlyArray<MergeRequirement>>,
  indent = "",
): void => {
  for (const [index, node] of nodes.entries()) {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childIndent = `${indent}${isLast ? "    " : "│   "}`;

    switch (node._tag) {
      case "directory": {
        lines.push(`${indent}${connector}${node.name}`);
        appendPlanTreeChildren(
          lines,
          node.children,
          mergeRequirementsByPath,
          childIndent,
        );
        break;
      }
      case "file": {
        lines.push(
          `${indent}${connector}${formatPlanClassificationBadge(node.classification)} ${node.name}`,
        );

        const mergeRequirements = mergeRequirementsByPath.get(node.path) ?? [];

        for (const mergeRequirement of mergeRequirements) {
          lines.push(
            `${childIndent}${formatMergeRequirementLine(mergeRequirement)}`,
          );
        }

        break;
      }
    }
  }
};

const groupMergeRequirementsByPath = (
  mergeRequirements: ReadonlyArray<MergeRequirement>,
): Map<string, Array<MergeRequirement>> => {
  const mergeRequirementsByPath = new Map<string, Array<MergeRequirement>>();

  for (const mergeRequirement of mergeRequirements) {
    const requirements =
      mergeRequirementsByPath.get(mergeRequirement.path) ?? [];
    requirements.push(mergeRequirement);
    mergeRequirementsByPath.set(mergeRequirement.path, requirements);
  }

  return mergeRequirementsByPath;
};

const formatPlanClassificationBadge = (
  classification: PlanEntryClassification,
): string => {
  switch (classification) {
    case "create":
      return "[+]";
    case "modify":
      return "[~]";
    case "unchanged":
      return "[=]";
    case "needsMergeStrategy":
      return "[!]";
  }
};

const formatMergeRequirementLine = (requirement: MergeRequirement): string => {
  switch (requirement._tag) {
    case "authoritativeFile":
      return "merge: authoritative file";
    case "barrelExport":
      return `merge: export ${requirement.exportPath}`;
    case "packageJsonDependencies":
      return `merge: ${requirement.section}.${requirement.dependencyName}`;
    case "packageJsonExports":
      return `merge: exports ${requirement.exportKey}`;
    case "packageJsonScripts":
      return `merge: scripts ${requirement.scriptName}`;
    case "tsconfig":
      return "merge: tsconfig";
  }
};

const formatPlanWarningLines = (warning: PlanWarning): Array<string> => {
  switch (warning._tag) {
    case "impliedDependency":
      return [`! ${warning.path}`, `  ${warning.message}`];
    case "mergeStrategyRequired":
      return [`! ${warning.path}`, `  ${warning.message}`];
  }
};
