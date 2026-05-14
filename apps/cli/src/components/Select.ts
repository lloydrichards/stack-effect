import { Data, Effect, Match } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { KeyBinding, whenBinding } from "../lib/KeyBinding.js";
import { Hint } from "./Hint.js";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

const SelectKeys = {
  Down: new KeyBinding({
    keys: ["down", "j", "tab"],
    label: "↓",
    action: "down",
  }),
  Up: new KeyBinding({ keys: ["up", "k"], label: "↑", action: "up" }),
  Submit: new KeyBinding({
    keys: ["enter", "return"],
    label: "enter",
    action: "select",
  }),
};

export const Select = <A>(
  options: Prompt.SelectOptions<A>,
): Prompt.Prompt<A> => {
  const { message, choices } = options;

  const renderLayout = (cursor: number, submitted: boolean) => {
    const label = Box.text(message).pipe(Box.annotate(Ansi.bold));

    const items = choices.map((c, i) => {
      const isSelected = i === cursor;
      const indicator = isSelected ? "> " : "  ";
      return Box.text(`${indicator}${c.title}`).pipe(
        Box.annotate(
          isSelected ? Ansi.combine(Ansi.cyan, Ansi.bold) : Ansi.dim,
        ),
      );
    });

    if (submitted) {
      const selected = choices[cursor];
      return Box.hsep(
        [
          Box.text("✔").pipe(Box.annotate(Ansi.green)),
          label,
          Box.text(selected?.title ?? "").pipe(Box.annotate(Ansi.cyan)),
        ],
        1,
        Box.top,
      );
    }

    const content = Box.vcat([label, Box.vcat(items, Box.left)], Box.left);

    return Box.vsep(
      [
        content.pipe(
          Box.pad(0, 0, 0, 1),
          Box.border("thick", {
            annotation: Ansi.dim,
            sides: { top: false, bottom: false, right: false },
          }),
        ),
        Hint(SelectKeys),
      ],
      1,
      Box.left,
    ).pipe(Box.moveDown(1));
  };

  return Prompt.custom<{ cursor: number; prevRows: number }, A>(
    { cursor: 0, prevRows: 0 },
    {
      render: Effect.fnUntraced(function* (state, action) {
        const currentState = action._tag === "NextFrame" ? action.state : state;
        const layout = Action.$match(action, {
          Beep: () => renderLayout(state.cursor, false),
          Submit: () => renderLayout(state.cursor, true),
          NextFrame: ({ state: s }) => renderLayout(s.cursor, false),
          default: () => renderLayout(state.cursor, false),
        });

        // Clear previous output and render new in a single write to avoid flicker
        const clear =
          currentState.prevRows > 0
            ? Cmd.clearLines(currentState.prevRows)
            : Cmd.cursorHide;

        const cmds =
          action._tag === "Submit"
            ? Box.combine(Cmd.cursorShow, Cmd.cursorNextLine(1))
            : Cmd.cursorHide;

        return yield* Box.renderPretty(
          Box.combine(clear, layout.pipe(Box.combine(cmds))),
        );
      }),
      process: Effect.fnUntraced(function* (input, state) {
        const prevRows = renderLayout(state.cursor, false).rows;

        return Match.value(input).pipe(
          whenBinding(SelectKeys.Down, () =>
            Action.NextFrame({
              state: {
                cursor: (state.cursor + 1) % choices.length,
                prevRows,
              },
            }),
          ),
          whenBinding(SelectKeys.Up, () =>
            Action.NextFrame({
              state: {
                cursor: (state.cursor - 1 + choices.length) % choices.length,
                prevRows,
              },
            }),
          ),
          whenBinding(SelectKeys.Submit, () => {
            const selected = choices[state.cursor];
            if (selected) {
              return Action.Submit({ value: selected.value });
            }
            return Action.Beep();
          }),
          Match.orElse(() =>
            Action.NextFrame({ state: { ...state, prevRows } }),
          ),
        );
      }),
      clear: Effect.fnUntraced(function* (_state) {
        return "";
      }),
    },
  );
};
