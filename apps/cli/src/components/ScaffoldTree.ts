import {
  type Blueprint,
  BlueprintNode,
  blueprintNodeOrder,
  edgeOrder,
} from "@repo/domain/Blueprint";
import {
  type Plan,
  type PlanConflict,
  type PlanEntryClassification,
  type PlanOutcome,
  byPath,
} from "@repo/domain/Plan";
import { Array as Arr, Match, Order, Schema, String } from "effect";
import { Ansi, Box } from "effect-boxes";

const planLegendBox = [
  Box.hsep(
    [Box.text("[+]").pipe(Box.annotate(Ansi.green)), Box.text("create")],
    1,
    Box.left,
  ),
  Box.hsep(
    [Box.text("[~]").pipe(Box.annotate(Ansi.yellow)), Box.text("modify")],
    1,
    Box.left,
  ),
  Box.hsep(
    [Box.text("[=]").pipe(Box.annotate(Ansi.dim)), Box.text("unchanged")],
    1,
    Box.left,
  ),
  Box.hsep(
    [Box.text("[!]").pipe(Box.annotate(Ansi.red)), Box.text("needs merge")],
    1,
    Box.left,
  ),
];

type FormattedBlueprint = {
  title: string;
  content: Box.Box<Ansi.AnsiStyle>;
};

type FormattedPlan = {
  title: string;
  legend: Box.Box<Ansi.AnsiStyle>;
  summary: string;
  tree: Box.Box<Ansi.AnsiStyle>;
};

type Connector = "dashed" | "solid" | "plain";

const CONNECTOR_TEXT = {
  dashed: "╌>",
  solid: "─>",
  plain: "──",
} satisfies Record<Connector, string>;

type TreeNode<A> = {
  label: Box.Box<A>;
  badge?: Box.Box<A>;
  connector: Connector;
  children: ReadonlyArray<TreeNode<A>>;
};

const treeNode = (
  connector: Connector,
  label: Box.Box<Ansi.AnsiStyle>,
  children: ReadonlyArray<TreeNode<Ansi.AnsiStyle>>,
): TreeNode<Ansi.AnsiStyle> => ({ label, connector, children });

const renderTreeNodes = <A>(
  nodes: ReadonlyArray<TreeNode<A>>,
  indent = "",
): Box.Box<A> => {
  if (nodes.length === 0) {
    return Box.nullBox as Box.Box<A>;
  }

  return Box.vcat(
    Arr.flatMap(nodes, (node, index) => {
      const isLast = index === nodes.length - 1;
      const connector = isLast ? "╰" : "├";
      const childIndent = String.concat(indent, isLast ? "    " : "│   ");

      const labelWithBadge = node.badge
        ? Box.hsep([node.badge, node.label], 1, Box.left)
        : node.label;

      const branchLine = Box.hcat(
        [
          Box.text(`${indent}${connector}`),
          Box.text(CONNECTOR_TEXT[node.connector]),
          labelWithBadge.pipe(Box.moveRight(1)),
        ],
        Box.top,
      );

      const childBox = renderTreeNodes(node.children, childIndent);

      return childBox.rows > 0 ? [branchLine, childBox] : [branchLine];
    }),
    Box.left,
  );
};

/** Renders a Blueprint as targets with their attached modules and dependency edges. */
export const formatBlueprint = (blueprint: Blueprint): FormattedBlueprint => {
  if (blueprint.nodes.length === 0) {
    return {
      title: "Blueprint",
      content: Box.text("(empty)").pipe(Box.annotate(Ansi.dim)),
    };
  }

  const attachedModulesByTarget = Map.groupBy(
    blueprint.nodes.filter(BlueprintNode.guards["attached-module"]),
    (node) => node.targetId,
  );

  const outgoingEdgesByNode = Map.groupBy(blueprint.edges, (edge) => edge.from);

  const targetBoxes = Arr.map(
    blueprint.nodes.filter(BlueprintNode.guards.target),
    (targetNode) => {
      const attachedModules = Arr.sort(
        attachedModulesByTarget.get(targetNode.id) ?? [],
        blueprintNodeOrder,
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

      const moduleNodes = Arr.map(attachedModules, (attachedModule) =>
        treeNode(
          "dashed",
          Box.text(attachedModule.id),
          Arr.map(
            Arr.sort(
              Arr.filter(
                outgoingEdgesByNode.get(attachedModule.id) ?? [],
                (edge) =>
                  edge.reason !== "owns-module" &&
                  !(
                    edge.reason === "required-target" &&
                    edge.to === attachedModule.targetId
                  ),
              ),
              edgeOrder,
            ),
            (edge) =>
              treeNode(
                "solid",
                Box.hsep(
                  [
                    Box.text(edge.to),
                    Box.text(`[${edge.reason}]`).pipe(Box.annotate(Ansi.dim)),
                  ],
                  1,
                  Box.left,
                ),
                [],
              ),
          ),
        ),
      );

      const moduleLines = renderTreeNodes(moduleNodes, "  ");

      return Box.vcat([targetHeader, moduleLines], Box.left);
    },
  );

  return {
    title: "Blueprint",
    content: Box.vsep(targetBoxes, 1, Box.left),
  };
};

/** Renders a Plan as a file tree with classification badges and conflicts. */
export const formatPlan = (plan: Plan): FormattedPlan => {
  const summary = Arr.reduce(
    plan.outcomes,
    {
      create: 0,
      modify: 0,
      unchanged: 0,
      conflict: 0,
    } satisfies Record<PlanEntryClassification, number>,
    (summary, outcome) => ({
      ...summary,
      [outcome.classification]: summary[outcome.classification] + 1,
    }),
  );

  const conflictsByPath = Map.groupBy(
    plan.conflicts,
    (conflict) => conflict.path,
  );

  const treeNodes = buildNodes(
    Arr.map(Arr.sort(plan.outcomes, byPath), (outcome) => ({
      segments: String.split(
        outcome.path.startsWith("./") ? outcome.path.slice(2) : outcome.path,
        "/",
      ),
      outcome,
    })),
    0,
    conflictsByPath,
  );

  const treeBox = Box.vcat(
    [Box.text("."), renderTreeNodes(treeNodes)],
    Box.left,
  );

  return {
    title: "Plan",
    legend: Box.hsep(planLegendBox, 2, Box.left),
    summary: `${summary.create} create  ${summary.modify} modify  ${summary.unchanged} unchanged  ${summary.conflict} merge`,
    tree: treeBox,
  };
};

type PathEntry = {
  segments: ReadonlyArray<string>;
  outcome: PlanOutcome;
};

type PathGroup = {
  key: string;
  files: ReadonlyArray<PathEntry>;
  directories: ReadonlyArray<PathEntry>;
};

// Directory groups sort before file leaves so paths render like a filesystem tree.
const directoriesFirst = Order.combine(
  Order.mapInput(
    Order.Boolean,
    (group: PathGroup) => group.directories.length === 0,
  ),
  Order.mapInput(Order.String, (group: PathGroup) => group.key.toLowerCase()),
);

const buildNodes = (
  entries: ReadonlyArray<PathEntry>,
  depth: number,
  conflictsByPath: ReadonlyMap<string, ReadonlyArray<PlanConflict>>,
): ReadonlyArray<TreeNode<Ansi.AnsiStyle>> => {
  if (entries.length === 0) return [];

  const segmented = entries.flatMap((entry) => {
    const key = entry.segments[depth];
    return key === undefined ? [] : [{ key, entry }];
  });
  const groups = Array.from(
    Map.groupBy(segmented, ({ key }) => key),
    ([key, items]): PathGroup => ({
      key,
      files: items.flatMap(({ entry }) =>
        entry.segments.length === depth + 1 ? [entry] : [],
      ),
      directories: items.flatMap(({ entry }) =>
        entry.segments.length > depth + 1 ? [entry] : [],
      ),
    }),
  );

  return groups.sort(directoriesFirst).flatMap((group) => [
    ...(group.directories.length > 0
      ? [
          treeNode(
            "plain",
            Box.text(group.key),
            buildNodes(group.directories, depth + 1, conflictsByPath),
          ),
        ]
      : []),
    ...group.files.map((file) => ({
      ...treeNode(
        "plain",
        Box.text(group.key),
        (conflictsByPath.get(file.outcome.path) ?? []).map((conflict) =>
          treeNode("plain", formatConflictLine(conflict), []),
        ),
      ),
      badge: formatPlanClassificationBadge(file.outcome.classification),
    })),
  ]);
};

const formatPlanClassificationBadge = (
  classification: PlanEntryClassification,
) => {
  const [text, style] = Match.value(classification).pipe(
    Match.when("create", () => ["[+]", Ansi.green] as const),
    Match.when("modify", () => ["[~]", Ansi.yellow] as const),
    Match.when("unchanged", () => ["[=]", Ansi.dim] as const),
    Match.when("conflict", () => ["[!]", Ansi.red] as const),
    Match.exhaustive,
  );
  return Box.text(text).pipe(Box.annotate(style));
};

const quoteVersion = Schema.encodeSync(Schema.fromJsonString(Schema.String));

/** Describe the existing and required dependency declarations when available. */
export const describeDependencyConflict = ({
  name,
  currentVersion,
  requiredVersion,
}: Extract<PlanConflict, { _tag: "dependencies" }>) => {
  if (requiredVersion === undefined) return name;
  const requirement = `requires ${quoteVersion(requiredVersion)}`;
  return currentVersion === undefined
    ? `${name} (${requirement})`
    : `${name} (declared ${quoteVersion(currentVersion)}, ${requirement})`;
};

const formatConflictLine = (conflict: PlanConflict) =>
  Box.text(
    Match.value(conflict).pipe(
      Match.tags({
        completeFile: () => "override replaces the entire file",
        dependencies: (c) =>
          `dependency conflict: ${c.section}.${describeDependencyConflict(c)}`,
        exports: (c) => `merge: exports ${c.name}`,
        scripts: (c) => `merge: scripts ${c.name}`,
        tsconfig: () => "merge: tsconfig",
        compositionTargetNotFound: (c) =>
          `composition target not found: ${c.targetVariable} (${c.functionName})`,
        jsxSlotTargetNotFound: (c) => `JSX slot target not found: ${c.slotId}`,
      }),
      Match.exhaustive,
    ),
  ).pipe(Box.annotate(Ansi.dim));
