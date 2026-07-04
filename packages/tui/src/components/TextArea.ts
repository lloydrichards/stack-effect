import { Data, Effect, Match, Option } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { KeyBinding, whenBinding } from "../lib/KeyBinding.js";
import * as Viewport from "../lib/Viewport.js";
import { Hint } from "./atom/Hint.js";
import { Panel, PromptChrome } from "./atom/Panel.js";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

interface TextAreaOptions extends Prompt.TextOptions {
  readonly minRows?: number;
  readonly maxRows?: number;
  readonly placeholder?: string;
}

interface TextAreaState {
  readonly lines: ReadonlyArray<string>;
  readonly row: number;
  readonly col: number;
  readonly stickyCol: number;
  readonly viewport: Viewport.State;
  readonly error: Option.Option<string>;
}

const splitLines = (value: string) => {
  const lines = value.split("\n");
  return lines.length === 0 ? [""] : lines;
};

const joinLines = (lines: ReadonlyArray<string>) => lines.join("\n");

const clampCol = (col: number, line: string) => Math.min(col, line.length);

const TextAreaKeys = {
  NewLine: new KeyBinding({
    keys: ["enter", "return"],
    label: "enter",
    action: "new line",
  }),
  Submit: new KeyBinding({
    keys: ["d"],
    label: "ctrl+d",
    action: "submit",
    ctrl: true,
  }),
  Cancel: new KeyBinding({
    keys: ["escape"],
    label: "esc",
    action: "cancel",
  }),
};

const TextAreaNavKeys = {
  Left: new KeyBinding({ keys: ["left"], label: "left", action: "left" }),
  Right: new KeyBinding({ keys: ["right"], label: "right", action: "right" }),
  Up: new KeyBinding({ keys: ["up"], label: "up", action: "up" }),
  Down: new KeyBinding({ keys: ["down"], label: "down", action: "down" }),
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

export const TextArea = (options: TextAreaOptions): Prompt.Prompt<string> => {
  const message = options.message;
  const defaultValue = options.default ?? "";
  const minRows = options.minRows ?? 3;
  const maxRows = options.maxRows ?? 10;
  const placeholder = options.placeholder ?? "";

  const renderLayout = (state: TextAreaState, submitted: boolean) => {
    const hasError = Option.isSome(state.error);
    const label = Box.text(message).pipe(Box.annotate(Ansi.bold));

    if (submitted) {
      const value = joinLines(state.lines) || defaultValue;
      const preview = value.split("\n")[0] ?? "";
      const displayValue = value.includes("\n") ? `${preview}...` : preview;
      return Box.hsep(
        [
          Box.text("✔").pipe(Box.annotate(Ansi.green)),
          label,
          Box.text(displayValue).pipe(Box.annotate(Ansi.cyan)),
        ],
        1,
        Box.top,
      );
    }

    const isEmpty =
      state.lines.length === 1 && state.lines[0] === "" && placeholder !== "";

    const visibleOffset = Viewport.scrollToReveal(
      state.viewport,
      state.row,
      maxRows,
    ).row;
    const visibleLines = state.lines.slice(
      visibleOffset,
      visibleOffset + maxRows,
    );

    const lineBoxes = isEmpty
      ? [Box.text(placeholder).pipe(Box.annotate(Ansi.dim))]
      : visibleLines.map((line, visibleIdx) => {
          const actualRow = visibleIdx + visibleOffset;
          const isCursorRow = actualRow === state.row;
          const rowNummber = Box.text(String(actualRow + 1)).pipe(
            Box.alignHoriz(Box.left, 3),
            Box.annotate(isCursorRow ? Ansi.white : Ansi.dim),
          );

          if (!isCursorRow) {
            return Box.hcat(
              [
                rowNummber,
                Box.text(line || " ").pipe(Box.annotate(Ansi.white)),
              ],
              Box.left,
            );
          }

          const col = clampCol(state.col, line);
          const before = line.slice(0, col);
          const cursorChar = line[col] ?? " ";
          const after = line.slice(col + 1);

          return Box.hcat(
            [
              rowNummber,
              Box.combineAll([
                Box.text(before).pipe(Box.annotate(Ansi.white)),
                Box.text(cursorChar).pipe(
                  Box.annotate(Ansi.combine(Ansi.bgWhite, Ansi.black)),
                ),
                Box.text(after).pipe(Box.annotate(Ansi.white)),
              ]),
            ],

            Box.left,
          );
        });

    const inputContent = Box.vcat(
      [
        Box.text("? ").pipe(Box.annotate(hasError ? Ansi.red : Ansi.cyan)),
        ...lineBoxes,
      ],
      Box.left,
    ).pipe(Box.minHeight(minRows + 1), Box.minWidth(40), Panel.make());

    const content = Box.vcat([label, inputContent], Box.left);

    const footer = hasError
      ? Box.text(`✘ ${state.error.value}`).pipe(
          Box.moveRight(2),
          Box.annotate(Ansi.red),
        )
      : Hint(TextAreaKeys);

    return Box.vcat(
      [content.pipe(PromptChrome(hasError ? Ansi.red : Ansi.dim)), footer],
      Box.left,
    );
  };

  const initialLines = defaultValue ? splitLines(defaultValue) : [""];
  const initialState: TextAreaState = {
    lines: initialLines,
    row: 0,
    col: 0,
    stickyCol: 0,
    viewport: Viewport.initial,
    error: Option.none(),
  };

  let hasRendered = false;

  return Prompt.custom<TextAreaState, string>(initialState, {
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
      const currentLine = state.lines[state.row] ?? "";

      /** Advance to next frame, clearing any active error on edits. */
      const next = (patch: Partial<TextAreaState>) => {
        const newState = {
          ...state,
          error: Option.none() as Option.Option<string>,
          ...patch,
        };
        const newViewport = Viewport.scrollToReveal(
          newState.viewport ?? state.viewport,
          newState.row ?? state.row,
          maxRows,
        );
        return Effect.succeed(
          Action.NextFrame({
            state: {
              ...newState,
              viewport: newViewport,
            },
          }),
        );
      };

      return yield* Match.value(input).pipe(
        // Modifier-aware bindings first (ctrl+d must match before 'd' is inserted)
        whenBinding(TextAreaKeys.Submit, () => {
          const finalValue = joinLines(state.lines) || defaultValue;
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
        whenBinding(TextAreaKeys.Cancel, () =>
          Effect.succeed(Action.Submit({ value: defaultValue })),
        ),
        // Navigation
        whenBinding(TextAreaNavKeys.Left, () => {
          if (state.col > 0) {
            const newCol = state.col - 1;
            return next({ col: newCol, stickyCol: newCol });
          }
          if (state.row > 0) {
            const prevLine = state.lines[state.row - 1] ?? "";
            return next({
              row: state.row - 1,
              col: prevLine.length,
              stickyCol: prevLine.length,
            });
          }
          return next({});
        }),
        whenBinding(TextAreaNavKeys.Right, () => {
          if (state.col < currentLine.length) {
            const newCol = state.col + 1;
            return next({ col: newCol, stickyCol: newCol });
          }
          if (state.row < state.lines.length - 1) {
            return next({ row: state.row + 1, col: 0, stickyCol: 0 });
          }
          return next({});
        }),
        whenBinding(TextAreaNavKeys.Up, () => {
          if (state.row === 0) return next({});
          const targetLine = state.lines[state.row - 1] ?? "";
          const newCol = clampCol(state.stickyCol, targetLine);
          return next({ row: state.row - 1, col: newCol });
        }),
        whenBinding(TextAreaNavKeys.Down, () => {
          if (state.row >= state.lines.length - 1) return next({});
          const targetLine = state.lines[state.row + 1] ?? "";
          const newCol = clampCol(state.stickyCol, targetLine);
          return next({ row: state.row + 1, col: newCol });
        }),
        whenBinding(TextAreaNavKeys.Backspace, () => {
          if (state.col > 0) {
            const newLine =
              currentLine.slice(0, state.col - 1) +
              currentLine.slice(state.col);
            const newLines = [...state.lines];
            newLines[state.row] = newLine;
            const newCol = state.col - 1;
            return next({
              lines: newLines,
              col: newCol,
              stickyCol: newCol,
            });
          }
          if (state.row > 0) {
            const prevLine = state.lines[state.row - 1] ?? "";
            const mergedLine = prevLine + currentLine;
            const newLines = [...state.lines];
            newLines.splice(state.row - 1, 2, mergedLine);
            return next({
              lines: newLines,
              row: state.row - 1,
              col: prevLine.length,
              stickyCol: prevLine.length,
            });
          }
          return next({});
        }),
        whenBinding(TextAreaNavKeys.Delete, () => {
          if (state.col < currentLine.length) {
            const newLine =
              currentLine.slice(0, state.col) +
              currentLine.slice(state.col + 1);
            const newLines = [...state.lines];
            newLines[state.row] = newLine;
            return next({ lines: newLines });
          }
          if (state.row < state.lines.length - 1) {
            const nextLine = state.lines[state.row + 1] ?? "";
            const mergedLine = currentLine + nextLine;
            const newLines = [...state.lines];
            newLines.splice(state.row, 2, mergedLine);
            return next({ lines: newLines });
          }
          return next({});
        }),
        whenBinding(TextAreaNavKeys.Home, () => next({ col: 0, stickyCol: 0 })),
        whenBinding(TextAreaNavKeys.End, () =>
          next({
            col: currentLine.length,
            stickyCol: currentLine.length,
          }),
        ),
        // Enter/return inserts new line (non-ctrl)
        whenBinding(TextAreaKeys.NewLine, () => {
          const before = currentLine.slice(0, state.col);
          const after = currentLine.slice(state.col);
          const insertLines = [...state.lines];
          insertLines.splice(state.row, 1, before, after);
          return next({
            lines: insertLines,
            row: state.row + 1,
            col: 0,
            stickyCol: 0,
          });
        }),
        // Insert printable characters or no-op
        Match.orElse(() => {
          if (char && char.length === 1 && !input.key.ctrl && !input.key.meta) {
            const newLine =
              currentLine.slice(0, state.col) +
              char +
              currentLine.slice(state.col);
            const newLines = [...state.lines];
            newLines[state.row] = newLine;
            const newCol = state.col + 1;
            return next({
              lines: newLines,
              col: newCol,
              stickyCol: newCol,
            });
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
