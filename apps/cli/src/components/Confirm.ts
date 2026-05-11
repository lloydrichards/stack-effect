import { Data, Effect } from "effect";
import { has } from "effect/Filter";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import type { AnsiStyle } from "effect-boxes/Ansi";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

export interface ConfirmOptions extends Prompt.ConfirmOptions {
  /** An optional Box to render between the message and the buttons. */
  readonly children?: Box.Box<AnsiStyle>;
}

interface ConfirmState {
  readonly cursor: number;
  readonly scrollOffset: number;
}

/** Rows reserved for prompt chrome (margin, message, gaps, buttons, hint). */
const CHROME_ROWS = 10;

/** Minimum rows for the children viewport. */
const MIN_VIEWPORT_ROWS = 3;

export const Confirm = (options: ConfirmOptions): Prompt.Prompt<boolean> => {
  const message = options.message;
  const initialValue = options.initial ?? false;
  const confirmLabel = options.label?.confirm ?? "Yes";
  const denyLabel = options.label?.deny ?? "No";
  const childrenBox = options.children;

  const choices = [
    { title: confirmLabel, value: true },
    { title: denyLabel, value: false },
  ] as const;

  // Pre-render children to lines for viewport scrolling
  const childrenRenderedLines: readonly Box.Box<AnsiStyle>[] = childrenBox
    ? Box.renderPrettySync(childrenBox)
        .split("\n")
        .map((l) => Box.line(l))
    : [];
  const hasChildren = childrenRenderedLines.length > 0;

  const viewportHeight = (terminalRows: number): number =>
    Math.max(MIN_VIEWPORT_ROWS, terminalRows - CHROME_ROWS);

  const renderSubmitted = (cursor: number) =>
    Box.hsep(
      [
        Box.text("✔").pipe(Box.annotate(Ansi.green)),
        Box.text(message).pipe(Box.annotate(Ansi.bold)),
        Box.text(choices[cursor]?.value ? confirmLabel : denyLabel).pipe(
          Box.annotate(Ansi.cyan),
        ),
      ],
      1,
      Box.top,
    );

  const renderButtons = (cursor: number) =>
    Box.hsep(
      choices.map((c, i) =>
        Box.text(c.title).pipe(
          Box.pad(0, 2),
          Box.annotate(
            i === cursor ? Ansi.combine(Ansi.bgCyan, Ansi.bold) : Ansi.bgBlack,
          ),
        ),
      ),
      1,
      Box.center1,
    );

  const renderChildrenViewport = (scrollOffset: number) =>
    Box.vcat(
      childrenRenderedLines.slice(
        scrollOffset,
        scrollOffset + viewportHeight(process.stdout.rows ?? 24),
      ),
      Box.left,
    ).pipe(
      Box.minWidth(childrenBox?.cols ?? 0),
      Box.maxWidth((process.stdout.columns ?? 80) - 10),
      Box.border("rounded", { annotation: Ansi.dim }),
    );

  const renderHint = () => {
    return Box.punctuateH(
      [
        ...(hasChildren ? [Box.text("↑/↓ scroll")] : []),
        Box.text("←/→ Toggle"),
        Box.text("enter next"),
        Box.text("esc cancel"),
      ],
      Box.left,
      Box.text(" • "),
    ).pipe(Box.moveRight(2), Box.annotate(Ansi.dim));
  };

  const renderActive = (state: ConfirmState) => {
    const content = Box.vsep(
      [
        Box.text(message).pipe(Box.annotate(Ansi.bold)),
        ...(hasChildren ? [renderChildrenViewport(state.scrollOffset)] : []),
        renderButtons(state.cursor),
      ],
      1,
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
        renderHint(),
      ],
      1,
      Box.left,
    ).pipe(Box.moveDown(1));
  };

  const renderLayout = (state: ConfirmState, submitted: boolean) =>
    submitted ? renderSubmitted(state.cursor) : renderActive(state);

  const initialState: ConfirmState = {
    cursor: initialValue ? 0 : 1,
    scrollOffset: 0,
  };

  return Prompt.custom<ConfirmState, boolean>(initialState, {
    render: (state, action) => {
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

      return Effect.succeed(
        Box.renderPrettySync(layout.pipe(Box.combine(cmds))),
      );
    },
    process: (input, state) => {
      const maxVisible = viewportHeight(process.stdout.rows ?? 24);
      const maxOffset = Math.max(0, childrenRenderedLines.length - maxVisible);

      switch (input.key.name) {
        case "up":
        case "k":
          if (hasChildren && state.scrollOffset > 0) {
            return Effect.succeed(
              Action.NextFrame({
                state: { ...state, scrollOffset: state.scrollOffset - 1 },
              }),
            );
          }
          return Effect.succeed(Action.NextFrame({ state }));
        case "down":
        case "j":
          if (hasChildren && state.scrollOffset < maxOffset) {
            return Effect.succeed(
              Action.NextFrame({
                state: { ...state, scrollOffset: state.scrollOffset + 1 },
              }),
            );
          }
          return Effect.succeed(Action.NextFrame({ state }));
        case "right":
        case "l":
        case "tab":
          return Effect.succeed(
            Action.NextFrame({
              state: {
                ...state,
                cursor: (state.cursor + 1) % choices.length,
              },
            }),
          );
        case "left":
        case "h":
          return Effect.succeed(
            Action.NextFrame({
              state: {
                ...state,
                cursor: (state.cursor - 1 + choices.length) % choices.length,
              },
            }),
          );
        case "escape":
          return Effect.succeed(Action.Submit({ value: false }));
        case "enter":
        case "return": {
          const selected = choices[state.cursor];
          if (selected) {
            return Effect.succeed(Action.Submit({ value: selected.value }));
          }
          return Effect.succeed(Action.Beep());
        }
        default:
          return Effect.succeed(Action.NextFrame({ state }));
      }
    },
    clear: (_state, _action) =>
      Effect.gen(function* () {
        return Cmd.clearLines(renderLayout(_state, false).rows).pipe(
          Box.renderPrettySync,
        );
      }),
  });
};
