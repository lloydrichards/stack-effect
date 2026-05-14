import { Data, Effect, Match } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { KeyBinding, whenBinding } from "../lib/KeyBinding.js";
import { Hint } from "./Hint.js";

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

export const HorizontalSelect = <A extends string>(
  options: Prompt.SelectOptions<A>,
): Prompt.Prompt<A> => {
  const { message, choices } = options;

  const renderLayout = (cursor: number, submitted: boolean) => {
    const prefix = submitted
      ? Box.text("✔").pipe(Box.annotate(Ansi.green))
      : Box.text("?").pipe(Box.annotate(Ansi.cyan));

    const label = Box.text(message).pipe(Box.annotate(Ansi.bold));

    const items = choices.map((c, i) => {
      const isSelected = i === cursor;

      return Box.text(c.title).pipe(
        Box.pad(0, 2),
        Box.border("rounded"),
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

    const content = Box.vcat(
      [
        Box.hsep([prefix, label, Box.text(" ")], 2, Box.center1),
        Box.hsep(items, 2, Box.center1),
      ],
      Box.left,
    );

    return Box.vsep(
      [
        content.pipe(
          Box.pad(0, 0, 0, 1),
          Box.border("thick", {
            annotation: Ansi.dim,
            sides: { top: false, bottom: false, right: false },
          }),
        ),
        Hint(HorizontalSelectKeys),
      ],
      1,
      Box.left,
    ).pipe(Box.moveDown(1));
  };

  let hasRendered = false;

  return Prompt.custom<number, A>(0, {
    render: Effect.fnUntraced(function* (cursor, action) {
      const layout = Action.$match(action, {
        Beep: () => renderLayout(cursor, false),
        Submit: () => renderLayout(cursor, true),
        NextFrame: ({ state }) => renderLayout(state, false),
        default: () => renderLayout(cursor, false),
      });

      // Compute previous frame height from old state; skip on initial render
      const clear = hasRendered
        ? Cmd.clearLines(renderLayout(cursor, false).rows)
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
