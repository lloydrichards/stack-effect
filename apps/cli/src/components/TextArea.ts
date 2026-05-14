import { Data, Effect, Match, Option } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";

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
  readonly scrollOffset: number;
}

const splitLines = (value: string): Array<string> => {
  const lines = value.split("\n");
  return lines.length === 0 ? [""] : lines;
};

const joinLines = (lines: ReadonlyArray<string>): string => lines.join("\n");

const clampCol = (col: number, line: string): number =>
  Math.min(col, line.length);

const computeScrollOffset = (
  row: number,
  maxRows: number,
  totalLines: number,
  currentOffset: number,
): number => {
  if (totalLines <= maxRows) return 0;
  if (row < currentOffset) return row;
  if (row >= currentOffset + maxRows) return row - maxRows + 1;
  return currentOffset;
};

export const TextArea = (options: TextAreaOptions): Prompt.Prompt<string> => {
  const message = options.message;
  const defaultValue = options.default ?? "";
  const minRows = options.minRows ?? 3;
  const maxRows = options.maxRows ?? 10;
  const placeholder = options.placeholder ?? "";

  const renderLayout = (state: TextAreaState, submitted: boolean) => {
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

    const visibleOffset = computeScrollOffset(
      state.row,
      maxRows,
      state.lines.length,
      state.scrollOffset,
    );
    const visibleLines = state.lines.slice(
      visibleOffset,
      visibleOffset + maxRows,
    );

    const lineBoxes = isEmpty
      ? [Box.text(placeholder).pipe(Box.annotate(Ansi.dim))]
      : visibleLines.map((line, visibleIdx) => {
          const actualRow = visibleIdx + visibleOffset;
          const isCursorRow = actualRow === state.row;
          const rowNummber = Box.text(`${actualRow} `).pipe(
            Box.minWidth(2),
            Box.annotate(Ansi.dim),
          );

          if (!isCursorRow) {
            return Box.hsep(
              [
                rowNummber,
                Box.text(line || " ").pipe(Box.annotate(Ansi.white)),
              ],
              1,
              Box.left,
            );
          }

          const col = clampCol(state.col, line);
          const before = line.slice(0, col);
          const cursorChar = line[col] ?? " ";
          const after = line.slice(col + 1);

          return Box.hsep(
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
            1,
            Box.left,
          );
        });

    const inputContent = Box.vcat(
      [Box.text("? ").pipe(Box.annotate(Ansi.cyan)), ...lineBoxes],
      Box.left,
    ).pipe(Box.minHeight(minRows + 1), Box.minWidth(40), Box.border("rounded"));

    const content = Box.vcat([label, inputContent], Box.left);

    const hint = Box.punctuateH(
      [
        Box.text("enter new line"),
        Box.text("ctrl+d submit"),
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

  const initialLines = defaultValue ? splitLines(defaultValue) : [""];
  const initialState: TextAreaState = {
    lines: initialLines,
    row: 0,
    col: 0,
    stickyCol: 0,
    scrollOffset: 0,
  };

  return Prompt.custom<TextAreaState, string>(initialState, {
    render: Effect.fnUntraced(function* (state, action) {
      const layout = Action.$match(action, {
        Beep: () => renderLayout(state, false),
        Submit: () => renderLayout(state, true),
        NextFrame: ({ state: s }) => renderLayout(s, false),
        default: () => renderLayout(state, false),
      });

      const cmds =
        action._tag === "Submit"
          ? Box.combine(Cmd.cursorShow, Cmd.cursorNextLine(1))
          : Cmd.cursorHide;

      return yield* Box.renderPretty(layout.pipe(Box.combine(cmds)));
    }),
    process: Effect.fnUntraced(function* (input, state) {
      const char = Option.getOrElse(input.input, () => "");
      const currentLine = state.lines[state.row] ?? "";

      const next = (patch: Partial<TextAreaState>) => {
        const newState = { ...state, ...patch };
        const newOffset = computeScrollOffset(
          newState.row,
          maxRows,
          newState.lines.length,
          newState.scrollOffset,
        );
        return Effect.succeed(
          Action.NextFrame({
            state: { ...newState, scrollOffset: newOffset },
          }),
        );
      };

      return yield* Match.value(input.key.name).pipe(
        Match.when("left", () => {
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
          return Effect.succeed(Action.NextFrame({ state }));
        }),
        Match.when("right", () => {
          if (state.col < currentLine.length) {
            const newCol = state.col + 1;
            return next({ col: newCol, stickyCol: newCol });
          }
          if (state.row < state.lines.length - 1) {
            return next({ row: state.row + 1, col: 0, stickyCol: 0 });
          }
          return Effect.succeed(Action.NextFrame({ state }));
        }),
        Match.when("up", () => {
          if (state.row === 0)
            return Effect.succeed(Action.NextFrame({ state }));
          const targetLine = state.lines[state.row - 1] ?? "";
          const newCol = clampCol(state.stickyCol, targetLine);
          return next({ row: state.row - 1, col: newCol });
        }),
        Match.when("down", () => {
          if (state.row >= state.lines.length - 1)
            return Effect.succeed(Action.NextFrame({ state }));
          const targetLine = state.lines[state.row + 1] ?? "";
          const newCol = clampCol(state.stickyCol, targetLine);
          return next({ row: state.row + 1, col: newCol });
        }),
        Match.when("backspace", () => {
          if (state.col > 0) {
            const newLine =
              currentLine.slice(0, state.col - 1) +
              currentLine.slice(state.col);
            const newLines = [...state.lines];
            newLines[state.row] = newLine;
            const newCol = state.col - 1;
            return next({ lines: newLines, col: newCol, stickyCol: newCol });
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
          return Effect.succeed(Action.NextFrame({ state }));
        }),
        Match.when("delete", () => {
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
          return Effect.succeed(Action.NextFrame({ state }));
        }),
        Match.when("home", () => next({ col: 0, stickyCol: 0 })),
        Match.when("end", () =>
          next({
            col: currentLine.length,
            stickyCol: currentLine.length,
          }),
        ),
        Match.when("escape", () =>
          Effect.succeed(Action.Submit({ value: defaultValue })),
        ),
        Match.when("d", () => {
          if (input.key.ctrl) {
            const finalValue = joinLines(state.lines) || defaultValue;
            if (options.validate) {
              return options.validate(finalValue).pipe(
                Effect.map((v) => Action.Submit({ value: v })),
                Effect.catch(() => Effect.succeed(Action.NextFrame({ state }))),
              );
            }
            return Effect.succeed(Action.Submit({ value: finalValue }));
          }
          const newLine =
            currentLine.slice(0, state.col) +
            "d" +
            currentLine.slice(state.col);
          const newLines = [...state.lines];
          newLines[state.row] = newLine;
          const newCol = state.col + 1;
          return next({ lines: newLines, col: newCol, stickyCol: newCol });
        }),
        Match.whenOr("enter", "return", "j", () => {
          if (input.key.name === "j" && !input.key.ctrl) {
            const newLine =
              currentLine.slice(0, state.col) +
              "j" +
              currentLine.slice(state.col);
            const newLines = [...state.lines];
            newLines[state.row] = newLine;
            const newCol = state.col + 1;
            return next({ lines: newLines, col: newCol, stickyCol: newCol });
          }
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
        Match.orElse(() => {
          if (char && char.length === 1 && !input.key.ctrl && !input.key.meta) {
            const newLine =
              currentLine.slice(0, state.col) +
              char +
              currentLine.slice(state.col);
            const newLines = [...state.lines];
            newLines[state.row] = newLine;
            const newCol = state.col + 1;
            return next({ lines: newLines, col: newCol, stickyCol: newCol });
          }
          return Effect.succeed(Action.NextFrame({ state }));
        }),
      );
    }),
    clear: Effect.fnUntraced(function* (state) {
      return yield* Box.renderPretty(
        Cmd.clearLines(renderLayout(state, false).rows),
      );
    }),
  });
};
