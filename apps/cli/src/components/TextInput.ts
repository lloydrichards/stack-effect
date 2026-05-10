import { Array as Arr, Data, Effect, Option, pipe } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

interface TextState {
  readonly value: string;
  readonly cursor: number;
}

export const TextInput = (
  options: Prompt.TextOptions,
): Prompt.Prompt<string> => {
  const message = options.message;
  const defaultValue = options.default ?? "";

  const renderLayout = (state: TextState, submitted: boolean) => {
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
            Box.text("? ").pipe(Box.annotate(Ansi.cyan)),
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

    const hint = Box.punctuateH(
      [
        Box.text("type to edit"),
        Box.text("enter submit"),
        Box.text("esc cancel"),
      ],
      Box.left,
      Box.text(" • "),
    ).pipe(Box.moveRight(2), Box.annotate(Ansi.dim));

    return Box.vsep(
      [
        content.pipe(
          Box.pad(0, 0, 0, 1),
          Box.border("thick", {
            annotation: Ansi.dim,
            sides: { top: false, bottom: false, right: false },
          }),
        ),
        hint,
      ],
      1,
      Box.left,
    ).pipe(Box.moveDown(1));
  };

  const initialState: TextState = { value: "", cursor: 0 };

  return Prompt.custom<TextState, string>(initialState, {
    render: (state, action) => {
      const layout = Action.$match(action, {
        Beep: () => renderLayout(state, false),
        Submit: () => renderLayout(state, true),
        NextFrame: ({ state: s }) => renderLayout(s, false),
        default: () => renderLayout(state, false),
      });
      return Effect.succeed(
        Box.renderPrettySync(
          layout.pipe(
            Box.combine(
              action._tag === "Submit"
                ? Box.combine(Cmd.cursorShow, Cmd.cursorNextLine(1))
                : Cmd.cursorHide,
            ),
          ),
        ),
      );
    },
    process: (input, state) => {
      const key = input.key.name;
      const char = Option.getOrElse(input.input, () => "");

      switch (key) {
        case "left":
          return Effect.succeed(
            Action.NextFrame({
              state: { ...state, cursor: Math.max(0, state.cursor - 1) },
            }),
          );
        case "right":
          return Effect.succeed(
            Action.NextFrame({
              state: {
                ...state,
                cursor: Math.min(state.value.length, state.cursor + 1),
              },
            }),
          );
        case "backspace": {
          if (state.cursor === 0) return Effect.succeed(Action.Beep());
          const newValue =
            state.value.slice(0, state.cursor - 1) +
            state.value.slice(state.cursor);
          return Effect.succeed(
            Action.NextFrame({
              state: { value: newValue, cursor: state.cursor - 1 },
            }),
          );
        }
        case "delete": {
          if (state.cursor >= state.value.length)
            return Effect.succeed(Action.Beep());
          const newValue =
            state.value.slice(0, state.cursor) +
            state.value.slice(state.cursor + 1);
          return Effect.succeed(
            Action.NextFrame({
              state: { value: newValue, cursor: state.cursor },
            }),
          );
        }
        case "home":
          return Effect.succeed(
            Action.NextFrame({ state: { ...state, cursor: 0 } }),
          );
        case "end":
          return Effect.succeed(
            Action.NextFrame({
              state: { ...state, cursor: state.value.length },
            }),
          );
        case "escape":
          return Effect.succeed(Action.Submit({ value: defaultValue }));
        case "enter":
        case "return": {
          const finalValue = state.value || defaultValue;
          if (options.validate) {
            return options.validate(finalValue).pipe(
              Effect.map((v) => Action.Submit({ value: v })),
              Effect.catchIf(
                () => true,
                () => Effect.succeed(Action.Beep()),
              ),
            );
          }
          return Effect.succeed(Action.Submit({ value: finalValue }));
        }
        default: {
          if (char && char.length === 1 && !input.key.ctrl && !input.key.meta) {
            const newValue =
              state.value.slice(0, state.cursor) +
              char +
              state.value.slice(state.cursor);
            return Effect.succeed(
              Action.NextFrame({
                state: { value: newValue, cursor: state.cursor + 1 },
              }),
            );
          }
          return Effect.succeed(Action.NextFrame({ state }));
        }
      }
    },
    clear: (state, _action) =>
      Effect.gen(function* () {
        return Cmd.clearLines(renderLayout(state, false).rows).pipe(
          Box.renderPrettySync,
        );
      }),
  });
};
