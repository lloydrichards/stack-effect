import {
  type Blueprint,
  type BlueprintAttachedModuleNode,
  BlueprintNode,
  blueprintNodeOrd,
} from "@repo/domain/Blueprint";
import { idOrd, pathOrd } from "@repo/domain/Order";
import type {
  Plan,
  PlanConflict,
  PlanEntryClassification,
  PlanOutcome,
} from "@repo/domain/Plan";
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

type FormattedPlan = {
  readonly title: string;
  readonly legend: Box.Box<Ansi.AnsiStyle>;
  readonly summary: string;
  readonly tree: Box.Box<Ansi.AnsiStyle>;
};

/**
 * Generic tree node that can represent any hierarchical data.
 * Used by both Blueprint and Plan formatters for consistent tree rendering.
 */
type TreeNode<A> = {
  readonly label: Box.Box<A>;
  readonly badge?: Box.Box<A>;
  readonly connector: "dashed" | "solid" | "plain";
  readonly children: ReadonlyArray<TreeNode<A>>;
};

/**
 * Renders a list of tree nodes as a Box with proper tree connectors and indentation.
 * Supports nested children recursively.
 */
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

      const connectorText = Match.value(node.connector).pipe(
        Match.when("dashed", () => "╌>"),
        Match.when("solid", () => "─>"),
        Match.when("plain", () => "──"),
        Match.exhaustive,
      );
      const labelWithBadge = node.badge
        ? Box.hsep([node.badge, node.label], 1, Box.left)
        : node.label;

      const branchLine = Box.hcat(
        [
          Box.text(`${indent}${connector}`),
          Box.text(connectorText),
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

export class ScaffoldFormatter extends Context.Service<ScaffoldFormatter>()(
  "ScaffoldFormatter",
  {
    make: Effect.gen(function* () {
      const formatBlueprint = Effect.fn("ScaffoldFormatter.formatBlueprint")(
        function* (blueprint: typeof Blueprint.Type) {
          if (blueprint.nodes.length === 0) {
            return {
              title: "Blueprint",
              content: Box.text("(empty)").pipe(Box.annotate(Ansi.dim)),
            };
          }

          const attachedModulesByTarget = pipe(
            blueprint.nodes,
            Arr.filter(BlueprintNode.guards["attached-module"]),
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
            blueprint.nodes.filter(BlueprintNode.guards.target),
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

              const moduleNodes: ReadonlyArray<TreeNode<Ansi.AnsiStyle>> =
                Arr.map(attachedModules, (attachedModule) => ({
                  label: Box.text(attachedModule.id),
                  connector: "dashed" as const,
                  children: Arr.map(
                    Arr.sort(
                      Arr.filter(
                        Arr.fromIterable(
                          outgoingEdgesByNode.get(attachedModule.id) ?? [],
                        ),
                        (edge) =>
                          edge.reason !== "owns-module" &&
                          !(
                            edge.reason === "required-target" &&
                            edge.to === attachedModule.targetId
                          ),
                      ),
                      idOrd,
                    ),
                    (edge) => ({
                      label: Box.hsep(
                        [
                          Box.text(edge.to),
                          Box.text(`[${edge.reason}]`).pipe(
                            Box.annotate(Ansi.dim),
                          ),
                        ],
                        1,
                        Box.left,
                      ),
                      connector: "solid" as const,
                      children: [],
                    }),
                  ),
                }));

              const moduleLines = renderTreeNodes(moduleNodes, "  ");

              return Box.vcat([targetHeader, moduleLines], Box.left);
            },
          );

          return {
            title: "Blueprint",
            content: Box.vsep(targetBoxes, 1, Box.left),
          };
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
          new Map<string, ReadonlyArray<typeof PlanConflict.Type>>(),
          (groups, conflict) =>
            groups.set(
              conflict.path,
              Arr.append(groups.get(conflict.path) ?? [], conflict),
            ),
        );

        const treeNodes = buildNodes(
          Arr.map(Arr.sort(plan.outcomes, pathOrd), (outcome) => ({
            segments: String.split(
              outcome.path.startsWith("./")
                ? outcome.path.slice(2)
                : outcome.path,
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
      });

      return { formatBlueprint, formatPlan } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(ScaffoldFormatter)(
    ScaffoldFormatter.make,
  );
}

const buildNodes = (
  entries: ReadonlyArray<{
    readonly segments: ReadonlyArray<string>;
    readonly outcome: typeof PlanOutcome.Type;
  }>,
  depth: number,
  conflictsByPath: ReadonlyMap<string, ReadonlyArray<typeof PlanConflict.Type>>,
): ReadonlyArray<TreeNode<Ansi.AnsiStyle>> => {
  if (entries.length === 0) return [];

  const groups = Arr.reduce<
    (typeof entries)[number],
    Array<{
      readonly key: string;
      readonly items: Array<(typeof entries)[number]>;
    }>
  >(entries, [], (groups, entry) => {
    const segment = entry.segments[depth];
    if (segment === undefined) return groups;
    const existing = groups.find((g) => g.key === segment);
    if (existing) {
      existing.items.push(entry);
    } else {
      groups.push({ key: segment, items: [entry] });
    }
    return groups;
  });

  // NOTE: Directory groups sort before file leaves so paths render like a filesystem tree.
  const classified = Arr.map(groups, (group) => {
    const hasDeep = group.items.some((e) => e.segments.length > depth + 1);
    return { ...group, hasDeep };
  });

  const sorted = [...classified].sort((a, b) => {
    if (a.hasDeep && !b.hasDeep) return -1;
    if (!a.hasDeep && b.hasDeep) return 1;
    return a.key.toLowerCase().localeCompare(b.key.toLowerCase());
  });

  return Arr.flatMap(
    sorted,
    (group): ReadonlyArray<TreeNode<Ansi.AnsiStyle>> => {
      const files = group.items.filter((e) => e.segments.length === depth + 1);
      const directories = group.items.filter(
        (e) => e.segments.length > depth + 1,
      );

      const result: Array<TreeNode<Ansi.AnsiStyle>> = [];

      if (directories.length > 0) {
        result.push({
          label: Box.text(group.key),
          connector: "plain",
          children: buildNodes(directories, depth + 1, conflictsByPath),
        });
      }

      for (const file of files) {
        const conflicts = conflictsByPath.get(file.outcome.path) ?? [];
        result.push({
          label: Box.text(group.key),
          badge: formatPlanClassificationBadge(file.outcome.classification),
          connector: "plain",
          children: Arr.map(conflicts, (conflict) => ({
            label: formatConflictLine(conflict),
            connector: "plain" as const,
            children: [],
          })),
        });
      }

      return result;
    },
  );
};

const formatPlanClassificationBadge = (
  classification: typeof PlanEntryClassification.Type,
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

const formatConflictLine = (conflict: typeof PlanConflict.Type) =>
  Box.text(
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
    ),
  ).pipe(Box.annotate(Ansi.dim));
