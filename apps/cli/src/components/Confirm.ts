import { Data, Effect, Match } from "effect";
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

  const renderChildrenViewport = Effect.fnUntraced(function* (
    scrollOffset: number,
  ) {
    const terminalRows = process.stdout.rows ?? 24;
    return Box.vcat(
      childrenRenderedLines.slice(
        scrollOffset,
        scrollOffset + viewportHeight(terminalRows),
      ),
      Box.left,
    ).pipe(
      Box.minWidth(childrenBox?.cols ?? 0),
      Box.maxWidth((process.stdout.columns ?? 80) - 10),
      Box.border("rounded", { annotation: Ansi.dim }),
    );
  });

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

  const renderActive = Effect.fnUntraced(function* (state: ConfirmState) {
    const content = Box.vsep(
      [
        Box.text(message).pipe(Box.annotate(Ansi.bold)),
        ...(hasChildren
          ? [yield* renderChildrenViewport(state.scrollOffset)]
          : []),
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
  });

  const renderLayout = Effect.fnUntraced(function* (
    state: ConfirmState,
    submitted: boolean,
  ) {
    return submitted
      ? renderSubmitted(state.cursor)
      : yield* renderActive(state);
  });

  const initialState: ConfirmState = {
    cursor: initialValue ? 0 : 1,
    scrollOffset: 0,
  };

  return Prompt.custom<ConfirmState, boolean>(initialState, {
    render: Effect.fnUntraced(function* (state, action) {
      const layout = yield* Action.$match(action, {
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
      const maxVisible = viewportHeight(process.stdout.rows ?? 24);
      const maxOffset = Math.max(0, childrenRenderedLines.length - maxVisible);

      return Match.value(input.key.name).pipe(
        Match.whenOr("up", "k", () => {
          if (hasChildren && state.scrollOffset > 0) {
            return Action.NextFrame({
              state: { ...state, scrollOffset: state.scrollOffset - 1 },
            });
          }
          return Action.NextFrame({ state });
        }),
        Match.whenOr("down", "j", () => {
          if (hasChildren && state.scrollOffset < maxOffset) {
            return Action.NextFrame({
              state: { ...state, scrollOffset: state.scrollOffset + 1 },
            });
          }
          return Action.NextFrame({ state });
        }),
        Match.whenOr("right", "l", "tab", () =>
          Action.NextFrame({
            state: {
              ...state,
              cursor: (state.cursor + 1) % choices.length,
            },
          }),
        ),
        Match.whenOr("left", "h", () =>
          Action.NextFrame({
            state: {
              ...state,
              cursor: (state.cursor - 1 + choices.length) % choices.length,
            },
          }),
        ),
        Match.when("escape", () => Action.Submit({ value: false })),
        Match.whenOr("enter", "return", () => {
          const selected = choices[state.cursor];
          if (selected) {
            return Action.Submit({ value: selected.value });
          }
          return Action.Beep();
        }),
        Match.orElse(() => Action.NextFrame({ state })),
      );
    }),
    clear: Effect.fnUntraced(function* (state) {
      return yield* Box.renderPretty(
        Cmd.clearLines((yield* renderLayout(state, false)).rows),
      );
    }),
  });
};
