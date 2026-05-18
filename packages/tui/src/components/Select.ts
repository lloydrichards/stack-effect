import { Data, Effect, Match } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { KeyBinding, whenBinding } from "../lib/KeyBinding.js";
import { Hint } from "./atom/Hint.js";
import { PromptChrome } from "./atom/Panel.js";

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
      const indicator = Box.char(isSelected ? "⏵" : " ").pipe(
        Box.annotate(Ansi.cyan),
      );
      const title = Box.text(c.title).pipe(
        Box.annotate(isSelected ? Ansi.bold : Ansi.dim),
      );
      const description =
        isSelected && c.description
          ? Box.text(c.description).pipe(Box.annotate(Ansi.dim))
          : Box.nullBox;

      return Box.hsep([indicator, title, description], 1, Box.left);
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

    return Box.vcat([content.pipe(PromptChrome()), Hint(SelectKeys)], Box.left);
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
        whenBinding(SelectKeys.Down, () =>
          Action.NextFrame({ state: (cursor + 1) % choices.length }),
        ),
        whenBinding(SelectKeys.Up, () =>
          Action.NextFrame({
            state: (cursor - 1 + choices.length) % choices.length,
          }),
        ),
        whenBinding(SelectKeys.Submit, () => {
          const selected = choices[cursor];
          if (selected) {
            return Action.Submit({ value: selected.value });
          }
          return Action.Beep();
        }),
        Match.orElse(() => Action.NextFrame({ state: cursor })),
      );
    }),
    clear: Effect.fnUntraced(function* (_state) {
      return "";
    }),
  });
};
