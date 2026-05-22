import {
  Array as Arr,
  Data,
  Effect,
  Match,
  Option,
  pipe,
  Result,
} from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { KeyBinding, whenBinding } from "../lib/KeyBinding.js";
import { Hint } from "./atom/Hint.js";
import { PromptChrome } from "./atom/Panel.js";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

// =============================================================================
// Types
// =============================================================================
export type NestedModuleNode<A> = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly value: A;
  readonly children?: ReadonlyArray<NestedModuleChild<A>>;
};

export type NestedModuleChild<A> = {
  readonly node: NestedModuleNode<A>;
  readonly requirement: "required" | "optional";
};

export type NestedMultiSelectOptions<A> = {
  readonly message: string;
  readonly choices: ReadonlyArray<NestedModuleNode<A>>;
  readonly min?: number;
  readonly max?: number;
  /** IDs of initially selected modules */
  readonly initialSelected?: ReadonlyArray<string>;
};

// =============================================================================
// Internal Types
// =============================================================================
type FlatItem<A> = {
  readonly node: NestedModuleNode<A>;
  readonly depth: number;
  readonly isLast: boolean;
  readonly parentPath: ReadonlyArray<boolean>; // true = parent is last in its level
  readonly requirement: "root" | "required" | "optional";
  readonly parentId: string | null;
};

type NestedMultiSelectState = {
  readonly cursor: number;
  readonly selected: ReadonlySet<string>; // Set of module IDs
};

// =============================================================================
// Key Bindings
// =============================================================================
const NestedSelectKeys = {
  Down: new KeyBinding({
    keys: ["down", "j", "tab"],
    label: "↑/↓",
    action: "navigate",
  }),
  Up: new KeyBinding({
    keys: ["up", "k"],
    label: "↑/↓",
    action: "navigate",
  }),
  Toggle: new KeyBinding({
    keys: ["space"],
    label: "space",
    action: "toggle",
  }),
  Submit: new KeyBinding({
    keys: ["enter", "return"],
    label: "enter",
    action: "submit",
  }),
};

const NestedSelectHintKeys = {
  Navigate: NestedSelectKeys.Down,
  Toggle: NestedSelectKeys.Toggle,
  Submit: NestedSelectKeys.Submit,
};

// =============================================================================
// Tree Helpers
// =============================================================================
const flattenTree = <A>(
  choices: ReadonlyArray<NestedModuleNode<A>>,
  selected: ReadonlySet<string>,
): ReadonlyArray<FlatItem<A>> => {
  const visitChildren = (
    children: ReadonlyArray<NestedModuleChild<A>>,
    depth: number,
    parentPath: ReadonlyArray<boolean>,
    parentId: string,
  ): ReadonlyArray<FlatItem<A>> =>
    Arr.flatMap(children, (child, index) => {
      const item: FlatItem<A> = {
        node: child.node,
        depth,
        isLast: index === children.length - 1,
        parentPath,
        requirement: child.requirement,
        parentId,
      };

      // Recursively visit grandchildren if this child is selected
      const grandchildren =
        child.node.children &&
        child.node.children.length > 0 &&
        selected.has(child.node.id)
          ? visitChildren(
              child.node.children,
              depth + 1,
              [...parentPath, index === children.length - 1],
              child.node.id,
            )
          : [];

      return [item, ...grandchildren];
    });

  // Visit top-level nodes
  return pipe(
    choices,
    Arr.flatMap((node, index) => {
      const item: FlatItem<A> = {
        node,
        depth: 0,
        isLast: index === choices.length - 1,
        parentPath: [],
        requirement: "root",
        parentId: null,
      };

      // Visit children if this node is selected (expanded)
      const children =
        node.children && node.children.length > 0 && selected.has(node.id)
          ? visitChildren(node.children, 1, [], node.id)
          : [];

      return [item, ...children];
    }),
  );
};

const countChildren = <A>(node: NestedModuleNode<A>): number =>
  pipe(
    Option.fromNullishOr(node.children),
    Option.map(Arr.length),
    Option.getOrElse(() => 0),
  );

const collectRequiredChildren = <A>(
  node: NestedModuleNode<A>,
): ReadonlySet<string> =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(node.children), (children) =>
      Arr.reduce(children, new Set<string>(), (acc, child) =>
        child.requirement === "required"
          ? new Set([
              ...acc,
              child.node.id,
              ...collectRequiredChildren(child.node),
            ])
          : acc,
      ),
    ),
    () => new Set<string>(),
  );

/**
 * Collect all descendant IDs recursively (for removal).
 */
const collectDescendants = <A>(
  node: NestedModuleNode<A>,
): ReadonlySet<string> =>
  pipe(
    Option.fromNullishOr(node.children),
    Option.map((children) =>
      Arr.reduce(
        children,
        new Set<string>([node.id]),
        (acc, child) => new Set([...acc, ...collectDescendants(child.node)]),
      ),
    ),
    Option.getOrElse(() => new Set([node.id])),
  );

const findNodeById = <A>(
  choices: ReadonlyArray<NestedModuleNode<A>>,
  id: string,
): Option.Option<NestedModuleNode<A>> => {
  const searchInNode = (
    node: NestedModuleNode<A>,
  ): Option.Option<NestedModuleNode<A>> =>
    node.id === id
      ? Option.some(node)
      : pipe(
          Option.fromNullishOr(node.children),
          Option.flatMap((children) =>
            pipe(
              children,
              Arr.findFirst((child) => Option.isSome(searchInNode(child.node))),
              Option.flatMap((child) => searchInNode(child.node)),
            ),
          ),
        );

  return pipe(
    choices,
    Arr.findFirst((node) => Option.isSome(searchInNode(node))),
    Option.flatMap(searchInNode),
  );
};

// =============================================================================
// Rendering
// =============================================================================

const renderTreeLine = (
  depth: number,
  isLast: boolean,
  parentPath: ReadonlyArray<boolean>,
) => {
  if (depth === 0) return "";

  // Base indentation to align with parent's checkbox (2 spaces for indicator + hsep)
  const baseIndent = "  ";

  // Build the prefix for all ancestor levels
  // Each level is 3 chars wide to match "├─ " / "└─ " / "│  " / "   "
  const ancestorPrefix = pipe(
    parentPath,
    Arr.map((wasLast) => (wasLast ? "   " : "│  ")),
    Arr.join(""),
  );

  // Add the connector for this level
  const connector = isLast ? "└─" : "├─";

  return baseIndent + ancestorPrefix + connector;
};

// =============================================================================
// Component
// =============================================================================

export const NestedMultiSelect = <A>(
  options: NestedMultiSelectOptions<A>,
): Prompt.Prompt<Array<A>> => {
  const { message, choices } = options;
  const min = options.min ?? 0;

  const renderLayout = (state: NestedMultiSelectState, submitted: boolean) => {
    const label = Box.text(message).pipe(Box.annotate(Ansi.bold));

    if (submitted) {
      const selectedTitles = pipe(
        Arr.fromIterable(state.selected),
        Arr.filterMap((id) =>
          pipe(
            findNodeById(choices, id),
            Option.map((node) => node.title),
            Result.fromOption(() => undefined),
          ),
        ),
      );
      return Box.hsep(
        [
          Box.text("✔").pipe(Box.annotate(Ansi.green)),
          label,
          Box.text(
            selectedTitles.length === 0
              ? "None"
              : Arr.join(selectedTitles, ", "),
          ).pipe(Box.annotate(Ansi.cyan)),
        ],
        1,
        Box.top,
      );
    }

    const flatItems = flattenTree(choices, state.selected);

    const items = pipe(
      flatItems,
      Arr.map((item, index) => {
        const isCursor = index === state.cursor;
        const isSelected = state.selected.has(item.node.id);
        const hasChildren = countChildren(item.node) > 0;
        const isRequired = item.requirement === "required";

        // Tree line prefix (string, includes indentation and connectors)
        const treeLineStr = renderTreeLine(
          item.depth,
          item.isLast,
          item.parentPath,
        );

        // Cursor indicator
        const indicator = Box.char(isCursor ? "⏵" : " ").pipe(
          Box.annotate(Ansi.cyan),
        );

        const checkbox = Match.value({
          isSelected,
          hasChildren,
          isRequired,
        }).pipe(
          // Collapsed with children - show chevron
          Match.when({ isSelected: false, hasChildren: true }, () =>
            Box.char("▶").pipe(Box.annotate(Ansi.dim)),
          ),
          // Required child - always checked, dimmed
          Match.when({ isRequired: true }, () =>
            Box.char("◼").pipe(Box.annotate(Ansi.dim)),
          ),
          // Normal checkbox
          Match.orElse(({ isSelected }) =>
            Box.char(isSelected ? "◼" : "◻").pipe(
              Box.annotate(isSelected ? Ansi.green : Ansi.dim),
            ),
          ),
        );

        const title = Box.text(item.node.title).pipe(
          Box.annotate(
            isRequired
              ? isCursor
                ? Ansi.combine(Ansi.dim, Ansi.bold)
                : Ansi.dim
              : isCursor
                ? Ansi.combine(isSelected ? Ansi.green : Ansi.white, Ansi.bold)
                : isSelected
                  ? Ansi.green
                  : Ansi.white,
          ),
        );

        const description = Option.liftPredicate(isCursor, Boolean).pipe(
          Option.flatMap(() =>
            Option.map(Option.fromNullishOr(item.node.description), (desc) =>
              Box.hsep(
                [
                  Box.text("·").pipe(Box.annotate(Ansi.dim)),
                  Box.text(desc).pipe(
                    Box.annotate(Ansi.combine(Ansi.dim, Ansi.italic)),
                  ),
                ],
                1,
                Box.left,
              ),
            ),
          ),
          Option.getOrElse(() => Box.nullBox),
        );

        if (item.depth === 0) {
          return Box.hsep(
            [indicator, checkbox, title, description],
            1,
            Box.left,
          );
        }

        const treePart = Box.text(treeLineStr).pipe(
          Box.annotate(isCursor ? Ansi.cyan : Ansi.dim),
        );
        const indicatorPart = isCursor
          ? Box.char("⏵").pipe(Box.annotate(Ansi.cyan))
          : Box.char(" ");
        const prefix = Box.hcat([treePart, indicatorPart, checkbox], Box.left);

        return Box.hsep([prefix, title, description], 1, Box.left);
      }),
    );

    const count = Box.text(`(${state.selected.size})`).pipe(
      Box.annotate(Ansi.dim),
    );

    const content = Box.vcat(
      [Box.hsep([label, count], 1, Box.center1), Box.vcat(items, Box.left)],
      Box.left,
    );

    return Box.vcat(
      [content.pipe(PromptChrome()), Hint(NestedSelectHintKeys)],
      Box.left,
    );
  };

  const initialState: NestedMultiSelectState = {
    cursor: 0,
    selected: new Set(options.initialSelected ?? []),
  };

  let hasRendered = false;
  let lastRowCount = 0;

  return Prompt.custom<NestedMultiSelectState, Array<A>>(initialState, {
    render: Effect.fnUntraced(function* (state, action) {
      const layout = Action.$match(action, {
        Beep: () => renderLayout(state, false),
        Submit: () => renderLayout(state, true),
        NextFrame: ({ state: s }) => renderLayout(s, false),
        default: () => renderLayout(state, false),
      });

      // Clear based on the previous render's row count
      const clear = hasRendered ? Cmd.clearLines(lastRowCount) : Cmd.cursorHide;

      // Track this render's row count for next clear
      lastRowCount = layout.rows;
      hasRendered = true;

      const cmds =
        action._tag === "Submit"
          ? Box.combine(Cmd.cursorShow, Cmd.cursorNextLine(1))
          : Cmd.cursorHide;

      return yield* Box.renderPretty(
        Box.combine(clear, layout.pipe(Box.combine(cmds))),
      );
    }),

    process: Effect.fnUntraced(function* (input, state) {
      const flatItems = flattenTree(choices, state.selected);

      const next = (patch: Partial<NestedMultiSelectState>) =>
        Action.NextFrame({ state: { ...state, ...patch } });

      return Match.value(input).pipe(
        whenBinding(NestedSelectKeys.Down, () => {
          const nextCursor = (state.cursor + 1) % flatItems.length;
          return next({ cursor: nextCursor });
        }),

        whenBinding(NestedSelectKeys.Up, () => {
          const nextCursor =
            (state.cursor - 1 + flatItems.length) % flatItems.length;
          return next({ cursor: nextCursor });
        }),

        whenBinding(NestedSelectKeys.Toggle, () =>
          pipe(
            Option.fromNullishOr(flatItems[state.cursor]),
            Option.filter((item) => item.requirement !== "required"),
            Option.map((item) => {
              const isCurrentlySelected = state.selected.has(item.node.id);
              const nextSelected = isCurrentlySelected
                ? new Set(
                    Arr.filter(
                      Arr.fromIterable(state.selected),
                      (id) => !collectDescendants(item.node).has(id),
                    ),
                  )
                : new Set([
                    ...state.selected,
                    item.node.id,
                    ...collectRequiredChildren(item.node),
                  ]);
              return next({ selected: nextSelected });
            }),
            Option.getOrElse(() => Action.Beep()),
          ),
        ),

        whenBinding(NestedSelectKeys.Submit, () => {
          if (state.selected.size < min) return Action.Beep();

          const collectValues = (
            nodes: ReadonlyArray<NestedModuleNode<A>>,
          ): Array<A> =>
            pipe(
              nodes,
              Arr.flatMap((node) => {
                const nodeValue = state.selected.has(node.id)
                  ? [node.value]
                  : [];
                const childValues = pipe(
                  Option.fromNullishOr(node.children),
                  Option.map((children) =>
                    collectValues(Arr.map(children, (c) => c.node)),
                  ),
                  Option.getOrElse(() => [] as Array<A>),
                );
                return [...nodeValue, ...childValues];
              }),
            );

          return Action.Submit({ value: collectValues(choices) });
        }),

        Match.orElse(() => next({})),
      );
    }),

    clear: () => Effect.succeed(""),
  });
};
