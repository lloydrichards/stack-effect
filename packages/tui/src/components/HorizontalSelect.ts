import { Array as Arr, Data, Effect, Match, pipe, Terminal } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { KeyBinding, whenBinding } from "../lib/KeyBinding.js";
import { Hint } from "./atom/Hint.js";
import { Panel, PromptChrome } from "./atom/Panel.js";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

const HorizontalSelectKeys = {
  Right: new KeyBinding({
    keys: ["right", "l", "tab"],
    label: "←/→",
    action: "toggle",
  }),
  Left: new KeyBinding({
    keys: ["left", "h"],
    label: "←/→",
    action: "toggle",
    enabled: false,
  }),
  Submit: new KeyBinding({
    keys: ["enter", "return"],
    label: "enter",
    action: "select",
  }),
  Cancel: new KeyBinding({
    keys: ["escape"],
    label: "esc",
    action: "cancel",
  }),
};

/**
 * Groups items into rows that fit within the given width.
 * Similar to CSS flex-wrap behavior.
 */
const wrapItems = <A>(
  items: ReadonlyArray<Box.Box<A>>,
  maxWidth: number,
  gap: number,
): ReadonlyArray<ReadonlyArray<Box.Box<A>>> =>
  pipe(
    items,
    Arr.reduce(
      {
        rows: [] as Array<Array<Box.Box<A>>>,
        currentRow: [] as Array<Box.Box<A>>,
        currentWidth: 0,
      },
      (acc, item) => {
        const itemWidth = item.cols;
        const widthWithGap =
          acc.currentWidth > 0 ? acc.currentWidth + gap + itemWidth : itemWidth;

        if (widthWithGap <= maxWidth || acc.currentRow.length === 0) {
          return {
            ...acc,
            currentRow: [...acc.currentRow, item],
            currentWidth: widthWithGap,
          };
        }
        return {
          rows: [...acc.rows, acc.currentRow],
          currentRow: [item],
          currentWidth: itemWidth,
        };
      },
    ),
    ({ rows, currentRow }) =>
      currentRow.length > 0 ? [...rows, currentRow] : rows,
  );

export const HorizontalSelect = <A extends string>(
  options: Prompt.SelectOptions<A>,
): Prompt.Prompt<A> => {
  const { message, choices } = options;

  const renderLayout = Effect.fnUntraced(function* (
    cursor: number,
    submitted: boolean,
  ) {
    const terminal = yield* Terminal.Terminal;
    const prefix = submitted
      ? Box.text("✔").pipe(Box.annotate(Ansi.green))
      : Box.text("?").pipe(Box.annotate(Ansi.cyan));

    const label = Box.text(message).pipe(Box.annotate(Ansi.bold));

    const items = choices.map((c, i) => {
      const isSelected = i === cursor;

      return Box.text(c.title).pipe(
        Panel.make({ padding: Box.pad(0, 2) }),
        Box.annotate(
          isSelected ? Ansi.combine(Ansi.cyan, Ansi.bold) : Ansi.dim,
        ),
      );
    });

    if (submitted) {
      const selected = choices[cursor];
      return Box.hsep(
        [
          prefix,
          label,
          Box.text(selected?.title ?? "").pipe(Box.annotate(Ansi.cyan)),
        ],
        1,
        Box.top,
      );
    }

    const terminalWidth = yield* terminal.columns ?? 80;
    const gap = 2;
    const wrappedRows = wrapItems(items, terminalWidth - 4, gap); // -4 for chrome padding

    const itemsLayout = Box.vcat(
      Arr.map(wrappedRows, (row) => Box.hsep(row, gap, Box.center1)),
      Box.left,
    );

    const content = Box.vcat(
      [Box.hsep([prefix, label, Box.text(" ")], 2, Box.center1), itemsLayout],
      Box.left,
    );

    return Box.vcat(
      [content.pipe(PromptChrome()), Hint(HorizontalSelectKeys)],
      Box.left,
    );
  });

  let hasRendered = false;

  return Prompt.custom<number, A>(0, {
    render: Effect.fnUntraced(function* (cursor, action) {
      const layout = yield* Action.$match(action, {
        Beep: () => renderLayout(cursor, false),
        Submit: () => renderLayout(cursor, true),
        NextFrame: ({ state }) => renderLayout(state, false),
        default: () => renderLayout(cursor, false),
      });

      // Compute previous frame height from old state; skip on initial render
      const clear = hasRendered
        ? Cmd.clearLines((yield* renderLayout(cursor, false)).rows)
        : Cmd.cursorHide;
      hasRendered = true;

      const cmds =
        action._tag === "Submit"
          ? Box.combine(Cmd.cursorShow, Cmd.cursorNextLine(1))
          : Cmd.cursorHide;

      return yield* Box.renderPretty(
        Box.combine(clear, layout.pipe(Box.combine(cmds))),
      );
    }),
    process: Effect.fnUntraced(function* (input, cursor) {
      return Match.value(input).pipe(
        whenBinding(HorizontalSelectKeys.Right, () =>
          Action.NextFrame({ state: (cursor + 1) % choices.length }),
        ),
        whenBinding(HorizontalSelectKeys.Left, () =>
          Action.NextFrame({
            state: (cursor - 1 + choices.length) % choices.length,
          }),
        ),
        whenBinding(HorizontalSelectKeys.Submit, () => {
          const selected = choices[cursor];
          if (selected) {
            return Action.Submit({ value: selected.value });
          }
          return Action.Beep();
        }),
        whenBinding(HorizontalSelectKeys.Cancel, () =>
          Action.Submit({ value: choices[0]!.value }),
        ),
        Match.orElse(() => Action.NextFrame({ state: cursor })),
      );
    }),
    clear: Effect.fnUntraced(function* (_state) {
      return "";
    }),
  });
};
