import { Schema } from "effect";
import { planConflictOrd, plannedFileOutcomeOrd } from "./Order";

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
    reason: Schema.Literals(["repoRootNotEmpty", "invalidPlanIntent"]),
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

export const PlannedPackageJsonExport = Schema.Struct({
  exportKey: Schema.String,
  exportValue: Schema.String,
});
export type PlannedPackageJsonExport = Schema.Schema.Type<
  typeof PlannedPackageJsonExport
>;

export const PlannedPackageJsonDependency = Schema.Struct({
  dependencyName: Schema.String,
  dependencyValue: Schema.String,
});
export type PlannedPackageJsonDependency = Schema.Schema.Type<
  typeof PlannedPackageJsonDependency
>;

export const PlannedPackageJsonScript = Schema.Struct({
  scriptName: Schema.String,
  scriptValue: Schema.String,
});
export type PlannedPackageJsonScript = Schema.Schema.Type<
  typeof PlannedPackageJsonScript
>;

export const PlannedDependencySection = Schema.Struct({
  section: Schema.Literals(["dependencies", "devDependencies"]),
  entries: Schema.Array(PlannedPackageJsonDependency),
});
export type PlannedDependencySection = Schema.Schema.Type<
  typeof PlannedDependencySection
>;

export const RequiredStructure = Schema.Struct({
  packageJsonExports: Schema.optional(Schema.Array(PlannedPackageJsonExport)),
  packageJsonDependencies: Schema.optional(
    Schema.Array(PlannedDependencySection),
  ),
  packageJsonScripts: Schema.optional(Schema.Array(PlannedPackageJsonScript)),
  reExports: Schema.optional(Schema.Array(Schema.String)),
});
export type RequiredStructure = Schema.Schema.Type<typeof RequiredStructure>;

export const AuthoritativeFileOutcome = Schema.TaggedStruct("authoritative", {
  path: Schema.String,
  classification: PlanEntryClassification,
  contents: Schema.String,
});
export type AuthoritativeFileOutcome = Schema.Schema.Type<
  typeof AuthoritativeFileOutcome
>;

export const StructuralMergeOutcome = Schema.TaggedStruct("structural", {
  path: Schema.String,
  classification: PlanEntryClassification,
  requiredStructure: RequiredStructure,
});
export type StructuralMergeOutcome = Schema.Schema.Type<
  typeof StructuralMergeOutcome
>;

export const PlannedFileOutcome = Schema.Union([
  AuthoritativeFileOutcome,
  StructuralMergeOutcome,
]);
export type PlannedFileOutcome = Schema.Schema.Type<typeof PlannedFileOutcome>;

type DerivedPlanTreeFileNode = {
  readonly _tag: "file";
  readonly name: string;
  readonly path: string;
  readonly classification: PlanEntryClassification;
};

type DerivedPlanTreeDirectoryNode = {
  readonly _tag: "directory";
  readonly name: string;
  readonly path: string;
  children: Array<DerivedPlanTreeNode>;
};

type DerivedPlanTreeNode = DerivedPlanTreeDirectoryNode | DerivedPlanTreeFileNode;

export class Plan extends Schema.Class<Plan>("Plan")({
  outcomes: Schema.Array(PlannedFileOutcome),
  conflicts: Schema.Array(PlanConflict),
}) {
  prettyPrint(): string {
    const summary = countPlanClassifications(this.outcomes);
    const conflictsByPath = groupConflictsByPath(this.conflicts);
    const tree = derivePlanTree(this.outcomes);
    const lines: Array<string> = [
      "Plan",
      "",
      "Legend: [+] create  [~] modify  [=] unchanged  [!] needs merge",
      "",
      `Summary: ${summary.create} create  ${summary.modify} modify  ${summary.unchanged} unchanged  ${summary.needsMergeStrategy} merge`,
      "",
      tree.name,
    ];

    appendPlanTreeChildren(lines, tree.children, conflictsByPath);

    return lines.join("\n");
  }

  toSorted(): Plan {
    return new Plan({
      outcomes: [...this.outcomes].sort(plannedFileOutcomeOrd),
      conflicts: [...this.conflicts].sort(planConflictOrd),
    });
  }
}

type PlanClassificationSummary = Record<PlanEntryClassification, number>;

const countPlanClassifications = (
  outcomes: ReadonlyArray<PlannedFileOutcome>,
): PlanClassificationSummary => {
  const summary: PlanClassificationSummary = {
    create: 0,
    modify: 0,
    unchanged: 0,
    needsMergeStrategy: 0,
  };

  for (const outcome of outcomes) {
    summary[outcome.classification] += 1;
  }

  return summary;
};

const derivePlanTree = (
  outcomes: ReadonlyArray<PlannedFileOutcome>,
): DerivedPlanTreeDirectoryNode => {
  const root: DerivedPlanTreeDirectoryNode = {
    _tag: "directory",
    name: ".",
    path: ".",
    children: [],
  };
  const directories = new Map<string, DerivedPlanTreeDirectoryNode>([[".", root]]);

  for (const outcome of outcomes) {
    const pathParts = outcome.path.split("/");

    for (let index = 1; index < pathParts.length; index += 1) {
      const directoryPath = pathParts.slice(0, index).join("/");

      if (directories.has(directoryPath)) {
        continue;
      }

      const node: DerivedPlanTreeDirectoryNode = {
        _tag: "directory",
        name: nameFromPath(directoryPath),
        path: directoryPath,
        children: [],
      };
      const parentPath = parentPathFromPath(directoryPath);

      directories.set(directoryPath, node);
      directories.get(parentPath)?.children.push(node);
    }

    directories.get(parentPathFromPath(outcome.path))?.children.push({
      _tag: "file",
      name: nameFromPath(outcome.path),
      path: outcome.path,
      classification: outcome.classification,
    });
  }

  return sortPlanTreeDirectoryNode(root);
};

const appendPlanTreeChildren = (
  lines: Array<string>,
  nodes: ReadonlyArray<DerivedPlanTreeNode>,
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

const sortPlanTreeDirectoryNode = (
  node: DerivedPlanTreeDirectoryNode,
): DerivedPlanTreeDirectoryNode => ({
  ...node,
  children: [...node.children]
    .map((child) =>
      child._tag === "directory" ? sortPlanTreeDirectoryNode(child) : child,
    )
    .sort(comparePlanTreeNodes),
});

const comparePlanTreeNodes = (
  left: DerivedPlanTreeNode,
  right: DerivedPlanTreeNode,
) => {
  if (left._tag !== right._tag) {
    return left._tag.localeCompare(right._tag);
  }

  if (left.name !== right.name) {
    return left.name.localeCompare(right.name);
  }

  return left.path.localeCompare(right.path);
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

const nameFromPath = (path: string) => {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
};

const parentPathFromPath = (path: string) => {
  const lastSeparatorIndex = path.lastIndexOf("/");

  if (lastSeparatorIndex === -1) {
    return ".";
  }

  return path.slice(0, lastSeparatorIndex);
};
