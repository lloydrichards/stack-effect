import {
  type Blueprint,
  type BlueprintAttachedModuleNode,
  blueprintNodeOrd,
  isBlueprintAttachedModuleNode,
  isBlueprintTargetNode,
} from "@repo/domain/Blueprint";
import { idOrd } from "@repo/domain/Order";
import type { Plan, PlanEntryClassification } from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Match,
  Order,
  pipe,
  String,
} from "effect";
import { Ansi, Box } from "effect-boxes";

type FormattedPlan = {
  readonly title: string;
  readonly legend: string;
  readonly summary: string;
  readonly tree: ReadonlyArray<string>;
};

type TreeBranch<A> = {
  readonly line: Box.Box<A>;
  readonly prefix: "╌>" | "─>";
  readonly children?: ReadonlyArray<TreeBranch<A>>;
};

type DerivedPlanTreeFileNode = {
  readonly _tag: "file";
  readonly name: string;
  readonly path: string;
  readonly classification: typeof PlanEntryClassification.Type;
};

type DerivedPlanTreeDirectoryNode = {
  readonly _tag: "directory";
  readonly name: string;
  readonly path: string;
  readonly children: ReadonlyArray<DerivedPlanTreeNode>;
};

type DerivedPlanTreeNode =
  | DerivedPlanTreeDirectoryNode
  | DerivedPlanTreeFileNode;

export class ScaffoldFormatter extends Context.Service<ScaffoldFormatter>()(
  "ScaffoldFormatter",
  {
    make: Effect.gen(function* () {
      const formatBlueprint = Effect.fn("ScaffoldFormatter.formatBlueprint")(
        function* (blueprint: typeof Blueprint.Type) {
          const header = Box.text("Blueprint").pipe(
            Box.annotate(Ansi.combine(Ansi.bold, Ansi.cyan)),
          );
          if (blueprint.nodes.length === 0) {
            return header;
          }

          const attachedModulesByTarget = pipe(
            blueprint.nodes,
            Arr.filter(isBlueprintAttachedModuleNode),
            Arr.reduce(
              new Map<
                string,
                ReadonlyArray<typeof BlueprintAttachedModuleNode.Type>
              >(),
              (groups, node) =>
                groups.set(
                  node.targetId,
                  Arr.append(groups.get(node.targetId) ?? [], node),
                ),
            ),
          );

          const outgoingEdgesByNode = Arr.reduce(
            blueprint.edges,
            new Map<
              string,
              ReadonlyArray<(typeof Blueprint.fields.edges.Type)[0]>
            >(),
            (groups, edge) =>
              groups.set(
                edge.from,
                Arr.append(groups.get(edge.from) ?? [], edge),
              ),
          );

          const targetBoxes = Arr.map(
            blueprint.nodes.filter(isBlueprintTargetNode),
            (targetNode) => {
              const attachedModules = Arr.sort(
                Arr.fromIterable(
                  attachedModulesByTarget.get(targetNode.id) ?? [],
                ),
                blueprintNodeOrd,
              );

              const targetHeader = Box.hcat(
                [
                  Box.text("- "),
                  Box.text(targetNode.id).pipe(Box.annotate(Ansi.bold)),
                  Box.text(` (${targetNode.identity.kind})`).pipe(
                    Box.annotate(Ansi.dim),
                  ),
                ],
                Box.top,
              );

              const moduleLines = renderTreeBranchesAsBox(
                Arr.map(attachedModules, (attachedModule) => ({
                  line: Box.text(attachedModule.id),
                  prefix: "╌>" as const,
                  children: Arr.map(
                    Arr.sort(
                      Arr.filter(
                        Arr.fromIterable(
                          outgoingEdgesByNode.get(attachedModule.id) ?? [],
                        ),
                        (edge) => edge.reason !== "owns-module",
                      ),
                      idOrd,
                    ),
                    (edge) => ({
                      line: Box.hsep(
                        [
                          Box.text(edge.to),
                          Box.text(`[${edge.reason}]`).pipe(
                            Box.annotate(Ansi.dim),
                          ),
                        ],
                        1,
                        Box.left,
                      ),
                      prefix: "─>" as const,
                    }),
                  ),
                })),
              );

              return Box.vcat([targetHeader, moduleLines], Box.left);
            },
          );

          return Box.vsep([header, ...targetBoxes], 1, Box.left);
        },
      );

      const formatPlan = Effect.fn("ScaffoldFormatter.formatPlan")(function* (
        plan: typeof Plan.Type,
      ): Generator<never, FormattedPlan> {
        const summary = Arr.reduce(
          plan.outcomes,
          {
            create: 0,
            modify: 0,
            unchanged: 0,
            conflict: 0,
          } satisfies Record<typeof PlanEntryClassification.Type, number>,
          (summary, outcome) => ({
            ...summary,
            [outcome.classification]: summary[outcome.classification] + 1,
          }),
        );

        const conflictsByPath = Arr.reduce(
          plan.conflicts,
          new Map<
            string,
            ReadonlyArray<typeof Plan.fields.conflicts.schema.Type>
          >(),
          (groups, conflict) =>
            groups.set(
              conflict.path,
              Arr.append(groups.get(conflict.path) ?? [], conflict),
            ),
        );
        const tree = sortPlanTreeDirectoryNode(
          Arr.reduce(
            plan.outcomes,
            emptyDirectoryNode("."),
            appendOutcomeToDirectoryNode,
          ),
        );

        return {
          title: "Plan",
          legend: "[+] create  [~] modify  [=] unchanged  [!] needs merge",
          summary: `${summary.create} create  ${summary.modify} modify  ${summary.unchanged} unchanged  ${summary.conflict} merge`,
          tree: [
            tree.name,
            ...renderPlanTreeChildren(tree.children, conflictsByPath),
          ],
        };
      });

      return { formatBlueprint, formatPlan } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(ScaffoldFormatter)(
    ScaffoldFormatter.make,
  );
}

const renderTreeBranchesAsBox = <A>(
  branches: ReadonlyArray<TreeBranch<A>>,
  indent = "  ",
): Box.Box<Ansi.AnsiStyle> => {
  if (branches.length === 0) {
    return Box.nullBox;
  }

  return Box.vcat(
    Arr.flatMap(branches, (branch, index) => {
      const isLast = index === branches.length - 1;
      const connector = isLast ? "└" : "├";
      const childIndent = String.concat(indent, isLast ? "    " : "│   ");

      const branchLine = Box.hcat(
        [
          Box.text(`${indent}${connector}`),
          Box.text(branch.prefix),
          branch.line.pipe(Box.moveRight(1)),
        ],
        Box.top,
      );

      const childBox = renderTreeBranchesAsBox(
        branch.children ?? [],
        childIndent,
      );

      return childBox.rows > 0 ? [branchLine, childBox] : [branchLine];
    }),
    Box.left,
  );
};

const renderTreeBranches = <A>(
  branches: ReadonlyArray<TreeBranch<A>>,
  indent = "  ",
): ReadonlyArray<string> =>
  Arr.flatMap(branches, (branch, index) => {
    const isLast = index === branches.length - 1;
    const childIndent = String.concat(indent, isLast ? "    " : "│   ");

    return [
      `${indent}${isLast ? "└" : "├"}${branch.prefix} ${branch.line}`,
      ...renderTreeBranches(branch.children ?? [], childIndent),
    ];
  });

const renderPlanTreeChildren = (
  nodes: ReadonlyArray<DerivedPlanTreeNode>,
  conflictsByPath: ReadonlyMap<
    string,
    ReadonlyArray<typeof Plan.fields.conflicts.schema.Type>
  >,
  indent = "",
): ReadonlyArray<string> =>
  Arr.flatMap(nodes, (node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childIndent = `${indent}${isLast ? "    " : "│   "}`;

    switch (node._tag) {
      case "directory":
        return [
          `${indent}${connector}${node.name}`,
          ...renderPlanTreeChildren(
            node.children,
            conflictsByPath,
            childIndent,
          ),
        ];
      case "file":
        return [
          `${indent}${connector}${formatPlanClassificationBadge(node.classification)} ${node.name}`,
          ...Arr.map(
            conflictsByPath.get(node.path) ?? [],
            (conflict) => `${childIndent}${formatConflictLine(conflict)}`,
          ),
        ];
    }
  });

const appendOutcomeToDirectoryNode = (
  root: DerivedPlanTreeDirectoryNode,
  outcome: typeof Plan.fields.outcomes.schema.Type,
): DerivedPlanTreeDirectoryNode =>
  appendNodeAtPath(root, String.split(outcome.path, "/"), {
    _tag: "file",
    name: nameFromPath(outcome.path),
    path: outcome.path,
    classification: outcome.classification,
  });

const appendNodeAtPath = (
  directory: DerivedPlanTreeDirectoryNode,
  pathParts: ReadonlyArray<string>,
  fileNode: DerivedPlanTreeFileNode,
): DerivedPlanTreeDirectoryNode => {
  const [head, ...tail] = pathParts;

  if (head === undefined) {
    return directory;
  }

  if (tail.length === 0) {
    return {
      ...directory,
      children: Arr.append(directory.children, fileNode),
    };
  }

  const directoryPath =
    directory.path === "." ? head : `${directory.path}/${head}`;
  const currentChild = directory.children.find(
    (child): child is DerivedPlanTreeDirectoryNode =>
      child._tag === "directory" && child.path === directoryPath,
  );
  const nextChild = appendNodeAtPath(
    currentChild ?? emptyDirectoryNode(directoryPath),
    tail,
    fileNode,
  );

  return {
    ...directory,
    children: Arr.append(
      Arr.filter(
        directory.children,
        (child) => child._tag !== "directory" || child.path !== nextChild.path,
      ),
      nextChild,
    ),
  };
};

const emptyDirectoryNode = (path: string): DerivedPlanTreeDirectoryNode => ({
  _tag: "directory",
  name: nameFromPath(path),
  path,
  children: [],
});

const sortPlanTreeDirectoryNode = (
  node: DerivedPlanTreeDirectoryNode,
): DerivedPlanTreeDirectoryNode => ({
  ...node,
  children: Arr.sort(
    Arr.map(node.children, (child) =>
      child._tag === "directory" ? sortPlanTreeDirectoryNode(child) : child,
    ),
    Order.mapInput(
      Order.combineAll<DerivedPlanTreeNode>([
        Order.mapInput(Order.String, (node) => node._tag),
        Order.mapInput(Order.String, (node) => String.toLowerCase(node.name)),
        Order.mapInput(Order.String, (node) => String.toLowerCase(node.path)),
      ]),
      (node: DerivedPlanTreeNode) => node,
    ),
  ),
});

const formatPlanClassificationBadge = (
  classification: typeof PlanEntryClassification.Type,
): string =>
  Match.value(classification).pipe(
    Match.when("create", () => "[+]"),
    Match.when("modify", () => "[~]"),
    Match.when("unchanged", () => "[=]"),
    Match.when("conflict", () => "[!]"),
    Match.exhaustive,
  );

const formatConflictLine = (
  conflict: typeof Plan.fields.conflicts.schema.Type,
): string =>
  Match.value(conflict).pipe(
    Match.tags({
      completeFile: () => "merge: complete file",
      barrelExport: (c) => `merge: export ${c.exportPath}`,
      dependencies: (c) => `merge: ${c.section}.${c.name}`,
      exports: (c) => `merge: exports ${c.name}`,
      scripts: (c) => `merge: scripts ${c.name}`,
      tsconfig: () => "merge: tsconfig",
      compositionTargetNotFound: (c) =>
        `composition target not found: ${c.targetVariable} (${c.functionName})`,
    }),
    Match.exhaustive,
  );

const nameFromPath = (path: string): string => {
  const parts = String.split(path, "/");
  return parts[parts.length - 1] ?? path;
};
