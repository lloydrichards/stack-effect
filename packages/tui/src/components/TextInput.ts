import { Data, Effect, Match, Option } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { KeyBinding, whenBinding } from "../lib/KeyBinding.js";
import { Hint } from "./atom/Hint.js";
import { PromptChrome } from "./atom/Panel.js";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

interface TextState {
  readonly value: string;
  readonly cursor: number;
  readonly error: Option.Option<string>;
}

const TextInputKeys = {
  Type: new KeyBinding({
    keys: [],
    label: "type",
    action: "to edit",
  }),
  Submit: new KeyBinding({
    keys: ["enter", "return"],
    label: "enter",
    action: "submit",
  }),
  Cancel: new KeyBinding({
    keys: ["escape"],
    label: "esc",
    action: "cancel",
  }),
};

const TextInputNavKeys = {
  Left: new KeyBinding({ keys: ["left"], label: "left", action: "left" }),
  Right: new KeyBinding({ keys: ["right"], label: "right", action: "right" }),
  Backspace: new KeyBinding({
    keys: ["backspace"],
    label: "backspace",
    action: "delete",
  }),
  Delete: new KeyBinding({
    keys: ["delete"],
    label: "delete",
    action: "delete forward",
  }),
  Home: new KeyBinding({ keys: ["home"], label: "home", action: "start" }),
  End: new KeyBinding({ keys: ["end"], label: "end", action: "end" }),
};

export const TextInput = (
  options: Prompt.TextOptions,
): Prompt.Prompt<string> => {
  const message = options.message;
  const defaultValue = options.default ?? "";

  const renderLayout = (state: TextState, submitted: boolean) => {
    const hasError = Option.isSome(state.error);
    const label = Box.text(message).pipe(Box.annotate(Ansi.bold));

    const displayValue = state.value || defaultValue;
    const isPlaceholder = state.value === "" && defaultValue !== "";

    const textBeforeCursor = displayValue.slice(0, state.cursor);
    const cursorChar = displayValue[state.cursor] ?? " ";
    const textAfterCursor = displayValue.slice(state.cursor + 1);

    const inputBox = submitted
      ? Box.text(displayValue).pipe(
          Box.annotate(Ansi.combine(Ansi.cyan, Ansi.dim)),
        )
      : Box.hsep(
          [
            Box.text("? ").pipe(Box.annotate(hasError ? Ansi.red : Ansi.cyan)),
            Box.text(textBeforeCursor).pipe(
              Box.annotate(
                isPlaceholder ? Ansi.dim : Ansi.combine(Ansi.white, Ansi.bold),
              ),
            ),
            Box.text(cursorChar).pipe(
              Box.annotate(Ansi.combine(Ansi.bgWhite, Ansi.black)),
            ),
            Box.text(textAfterCursor).pipe(
              Box.annotate(
                isPlaceholder ? Ansi.dim : Ansi.combine(Ansi.white, Ansi.bold),
              ),
            ),
          ],
          0,
          Box.center1,
        );

    if (submitted) {
      return Box.hsep(
        [
          Box.text("✔").pipe(Box.annotate(Ansi.green)),
          label,
          Box.text(state.value).pipe(Box.annotate(Ansi.cyan)),
        ],
        1,
        Box.top,
      );
    }

    const content = Box.vcat([label, inputBox], Box.left);

    const footer = hasError
      ? Box.text(`✘ ${state.error.value}`).pipe(
          Box.moveRight(2),
          Box.annotate(Ansi.red),
        )
      : Hint(TextInputKeys);

    return Box.vcat(
      [content.pipe(PromptChrome(hasError ? Ansi.red : Ansi.dim)), footer],
      Box.left,
    );
  };

  const initialState: TextState = {
    value: "",
    cursor: 0,
    error: Option.none(),
  };

  let hasRendered = false;

  return Prompt.custom<TextState, string>(initialState, {
    render: Effect.fnUntraced(function* (state, action) {
      const layout = Action.$match(action, {
        Beep: () => renderLayout(state, false),
        Submit: () => renderLayout(state, true),
        NextFrame: ({ state: s }) => renderLayout(s, false),
        default: () => renderLayout(state, false),
      });

      // Compute previous frame height from old state; skip on initial render
      const clear = hasRendered
        ? Cmd.clearLines(renderLayout(state, false).rows)
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
    process: Effect.fnUntraced(function* (input, state) {
      const char = Option.getOrElse(input.input, () => "");

      /** Advance to next frame, clearing any active error on edits. */
      const next = (patch: Partial<TextState>) =>
        Effect.succeed(
          Action.NextFrame({
            state: { ...state, error: Option.none(), ...patch },
          }),
        );

      return yield* Match.value(input).pipe(
        whenBinding(TextInputNavKeys.Left, () =>
          next({ cursor: Math.max(0, state.cursor - 1) }),
        ),
        whenBinding(TextInputNavKeys.Right, () =>
          next({ cursor: Math.min(state.value.length, state.cursor + 1) }),
        ),
        whenBinding(TextInputNavKeys.Backspace, () => {
          if (state.cursor === 0) return Effect.succeed(Action.Beep());
          const newValue =
            state.value.slice(0, state.cursor - 1) +
            state.value.slice(state.cursor);
          return next({ value: newValue, cursor: state.cursor - 1 });
        }),
        whenBinding(TextInputNavKeys.Delete, () => {
          if (state.cursor >= state.value.length)
            return Effect.succeed(Action.Beep());
          const newValue =
            state.value.slice(0, state.cursor) +
            state.value.slice(state.cursor + 1);
          return next({ value: newValue, cursor: state.cursor });
        }),
        whenBinding(TextInputNavKeys.Home, () => next({ cursor: 0 })),
        whenBinding(TextInputNavKeys.End, () =>
          next({ cursor: state.value.length }),
        ),
        whenBinding(TextInputKeys.Cancel, () =>
          Effect.succeed(Action.Submit({ value: defaultValue })),
        ),
        whenBinding(TextInputKeys.Submit, () => {
          const finalValue = state.value || defaultValue;
          if (options.validate) {
            return options.validate(finalValue).pipe(
              Effect.map((v) => Action.Submit({ value: v })),
              Effect.catch((err) =>
                next({
                  error: Option.some(
                    typeof err === "string" ? err : String(err),
                  ),
                }),
              ),
            );
          }
          return Effect.succeed(Action.Submit({ value: finalValue }));
        }),
        Match.orElse(() => {
          if (char && char.length === 1 && !input.key.ctrl && !input.key.meta) {
            const newValue =
              state.value.slice(0, state.cursor) +
              char +
              state.value.slice(state.cursor);
            return next({ value: newValue, cursor: state.cursor + 1 });
          }
          return next({});
        }),
      );
    }),
    clear: Effect.fnUntraced(function* (_state) {
      return "";
    }),
  });
};
