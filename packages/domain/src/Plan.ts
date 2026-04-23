import { Schema } from "effect";
import { planConflictOrd, planEntryOrd, planTreeNodeOrd } from "./Order";

export const PlanEntryClassification = Schema.Literals([
  "create",
  "modify",
  "unchanged",
  "needsMergeStrategy",
]);
export type PlanEntryClassification = Schema.Schema.Type<
  typeof PlanEntryClassification
>;

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

export const PlanConflict = Schema.Union([
  Schema.TaggedStruct("packageJsonExports", {
    path: Schema.String,
    exportKey: Schema.String,
  }),
  Schema.TaggedStruct("packageJsonDependencies", {
    path: Schema.String,
    section: Schema.String,
    dependencyName: Schema.String,
  }),
  Schema.TaggedStruct("packageJsonScripts", {
    path: Schema.String,
    scriptName: Schema.String,
  }),
  Schema.TaggedStruct("barrelExport", {
    path: Schema.String,
    exportPath: Schema.String,
  }),
  Schema.TaggedStruct("tsconfig", {
    path: Schema.String,
  }),
  Schema.TaggedStruct("authoritativeFile", {
    path: Schema.String,
  }),
]);
export type PlanConflict = Schema.Schema.Type<typeof PlanConflict>;

export const PlanFileEntry = Schema.Struct({
  _tag: Schema.Literal("file"),
  path: Schema.String,
  classification: PlanEntryClassification,
});
export type PlanFileEntry = Schema.Schema.Type<typeof PlanFileEntry>;

export const PlanDirectoryEntry = Schema.Struct({
  _tag: Schema.Literal("directory"),
  path: Schema.String,
});
export type PlanDirectoryEntry = Schema.Schema.Type<typeof PlanDirectoryEntry>;

export const PlanEntry = Schema.Union([PlanFileEntry, PlanDirectoryEntry]);
export type PlanEntry = Schema.Schema.Type<typeof PlanEntry>;

export const PlanTreeFileNode = Schema.Struct({
  _tag: Schema.Literal("file"),
  name: Schema.String,
  path: Schema.String,
  classification: PlanEntryClassification,
});
export type PlanTreeFileNode = Schema.Schema.Type<typeof PlanTreeFileNode>;

export interface PlanTreeDirectoryNode {
  readonly _tag: "directory";
  readonly name: string;
  readonly path: string;
  readonly children: ReadonlyArray<PlanTreeNode>;
}

export type PlanTreeNode = PlanTreeFileNode | PlanTreeDirectoryNode;

export const PlanTreeDirectoryNode = Schema.Struct({
  _tag: Schema.Literal("directory"),
  name: Schema.String,
  path: Schema.String,
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
  conflicts: Schema.Array(PlanConflict),
}) {
  prettyPrint(): string {
    const summary = countPlanClassifications(this.tree);
    const conflictsByPath = groupConflictsByPath(this.conflicts);
    const lines: Array<string> = [
      "Plan",
      "",
      "Legend: [+] create  [~] modify  [=] unchanged  [!] needs merge",
      "",
      `Summary: ${summary.create} create  ${summary.modify} modify  ${summary.unchanged} unchanged  ${summary.needsMergeStrategy} merge`,
      "",
      this.tree.name,
    ];

    appendPlanTreeChildren(lines, this.tree.children, conflictsByPath);

    return lines.join("\n");
  }

  toSorted(): Plan {
    return new Plan({
      entries: [...this.entries].sort(planEntryOrd),
      tree: sortPlanTreeDirectoryNode(this.tree),
      conflicts: [...this.conflicts].sort(planConflictOrd),
    });
  }
}

const sortPlanTreeDirectoryNode = (
  node: PlanTreeDirectoryNode,
): PlanTreeDirectoryNode => ({
  ...node,
  children: [...node.children].map(sortPlanTreeNode).sort(planTreeNodeOrd),
});

const sortPlanTreeNode = (node: PlanTreeNode): PlanTreeNode => {
  switch (node._tag) {
    case "directory":
      return sortPlanTreeDirectoryNode(node);
    case "file":
      return node;
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
  conflictsByPath: ReadonlyMap<string, ReadonlyArray<PlanConflict>>,
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
          conflictsByPath,
          childIndent,
        );
        break;
      }
      case "file": {
        lines.push(
          `${indent}${connector}${formatPlanClassificationBadge(node.classification)} ${node.name}`,
        );

        const conflicts = conflictsByPath.get(node.path) ?? [];

        for (const conflict of conflicts) {
          lines.push(`${childIndent}${formatConflictLine(conflict)}`);
        }

        break;
      }
    }
  }
};

const groupConflictsByPath = (
  conflicts: ReadonlyArray<PlanConflict>,
): Map<string, Array<PlanConflict>> => {
  const conflictsByPath = new Map<string, Array<PlanConflict>>();

  for (const conflict of conflicts) {
    const existing = conflictsByPath.get(conflict.path) ?? [];
    existing.push(conflict);
    conflictsByPath.set(conflict.path, existing);
  }

  return conflictsByPath;
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

const formatConflictLine = (conflict: PlanConflict): string => {
  switch (conflict._tag) {
    case "authoritativeFile":
      return "merge: authoritative file";
    case "barrelExport":
      return `merge: export ${conflict.exportPath}`;
    case "packageJsonDependencies":
      return `merge: ${conflict.section}.${conflict.dependencyName}`;
    case "packageJsonExports":
      return `merge: exports ${conflict.exportKey}`;
    case "packageJsonScripts":
      return `merge: scripts ${conflict.scriptName}`;
    case "tsconfig":
      return "merge: tsconfig";
  }
};
