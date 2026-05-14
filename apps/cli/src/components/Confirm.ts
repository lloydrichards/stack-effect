import { Data, Effect, Match, Option } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import type { AnsiStyle } from "effect-boxes/Ansi";
import { KeyBinding, whenBinding } from "../lib/KeyBinding.js";
import * as Viewport from "../lib/Viewport.js";
import { Hint } from "./Hint.js";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

export interface ConfirmOptions extends Prompt.ConfirmOptions {
  /** An optional Box to render between the message and the buttons. */
  readonly children?: Box.Box<AnsiStyle>;
}

interface ConfirmState {
  readonly cursor: number;
  readonly viewport: Viewport.State;
  readonly prevRows: number;
}

/** Rows reserved for prompt chrome (margin, message, gaps, buttons, hint). */
const CHROME_ROWS = 10;

/** Minimum rows for the children viewport. */
const MIN_VIEWPORT_ROWS = 3;

const ConfirmKeys = (hasChildren: boolean) => ({
  Scroll: new KeyBinding({
    keys: ["up", "down", "k", "j"],
    label: "↑/↓",
    action: "scroll",
    enabled: hasChildren,
  }),
  Toggle: new KeyBinding({
    keys: ["right", "left", "l", "h", "tab"],
    label: "←/→",
    action: "toggle",
  }),
  Submit: new KeyBinding({
    keys: ["enter", "return"],
    label: "enter",
    action: "next",
  }),
  Cancel: new KeyBinding({
    keys: ["escape"],
    label: "esc",
    action: "cancel",
  }),
});

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
    ? Viewport.linesFromBox(childrenBox)
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
    viewport: Viewport.State,
  ) {
    const terminalRows = process.stdout.rows ?? 24;
    const { items } = Viewport.render(
      childrenRenderedLines,
      viewport,
      viewportHeight(terminalRows),
    );
    return Box.vcat(items, Box.left).pipe(
      Box.minWidth(childrenBox?.cols ?? 0),
      Box.maxWidth((process.stdout.columns ?? 80) - 10),
      Box.border("rounded", { annotation: Ansi.dim }),
    );
  });

  const renderActive = Effect.fnUntraced(function* (state: ConfirmState) {
    const content = Box.vsep(
      [
        Box.text(message).pipe(Box.annotate(Ansi.bold)),
        ...(hasChildren ? [yield* renderChildrenViewport(state.viewport)] : []),
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
        Hint(ConfirmKeys(hasChildren)),
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
    viewport: Viewport.initial,
    prevRows: 0,
  };

  return Prompt.custom<ConfirmState, boolean>(initialState, {
    render: Effect.fnUntraced(function* (state, action) {
      const currentState = action._tag === "NextFrame" ? action.state : state;
      const layout = yield* Action.$match(action, {
        Beep: () => renderLayout(state, false),
        Submit: () => renderLayout(state, true),
        NextFrame: ({ state: s }) => renderLayout(s, false),
        default: () => renderLayout(state, false),
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
      const maxVisible = viewportHeight(process.stdout.rows ?? 24);
      const bounds: Viewport.Bounds = {
        contentHeight: childrenRenderedLines.length,
        visibleHeight: maxVisible,
      };
      const prevRows = (yield* renderActive(state)).rows;

      const next = (patch: Partial<ConfirmState>) =>
        Action.NextFrame({ state: { ...state, prevRows, ...patch } });

      return Match.value(input).pipe(
        whenBinding(ConfirmKeys(hasChildren).Scroll, (i) => {
          if (hasChildren) {
            const direction =
              i.key.name === "up" || i.key.name === "k" ? "up" : "down";
            const nextVp = Viewport.scroll(state.viewport, direction, bounds);
            if (Option.isSome(nextVp)) {
              return next({ viewport: nextVp.value });
            }
          }
          return next({});
        }),
        whenBinding(ConfirmKeys(hasChildren).Toggle, (i) => {
          const direction =
            i.key.name === "left" || i.key.name === "h" ? -1 : 1;
          return next({
            cursor:
              (state.cursor + direction + choices.length) % choices.length,
          });
        }),
        whenBinding(ConfirmKeys(hasChildren).Cancel, () =>
          Action.Submit({ value: false }),
        ),
        whenBinding(ConfirmKeys(hasChildren).Submit, () => {
          const selected = choices[state.cursor];
          if (selected) {
            return Action.Submit({ value: selected.value });
          }
          return Action.Beep();
        }),
        Match.orElse(() => next({})),
      );
    }),
    clear: Effect.fnUntraced(function* (_state) {
      return "";
    }),
  });
};
