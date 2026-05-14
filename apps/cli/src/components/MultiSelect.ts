import { Data, Effect, Match } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { KeyBinding, whenBinding } from "../lib/KeyBinding.js";
import { Hint } from "./Hint.js";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

interface MultiSelectState {
  readonly cursor: number;
  readonly selected: ReadonlySet<number>;
  readonly prevRows: number;
}

const MultiSelectKeys = {
  Down: new KeyBinding({
    keys: ["down", "j", "tab"],
    label: "↑/↓",
    action: "navigate",
  }),
  Up: new KeyBinding({
    keys: ["up", "k"],
    label: "↑/↓",
    action: "navigate",
  }),
  Toggle: new KeyBinding({
    keys: ["space"],
    label: "space",
    action: "toggle",
  }),
  ToggleAll: new KeyBinding({
    keys: ["a"],
    label: "a",
    action: "toggle all",
  }),
  Submit: new KeyBinding({
    keys: ["enter", "return"],
    label: "enter",
    action: "submit",
  }),
};

/** Hint shows deduplicated labels — Up/Down share the same label. */
const MultiSelectHintKeys = {
  Navigate: MultiSelectKeys.Down,
  Toggle: MultiSelectKeys.Toggle,
  ToggleAll: MultiSelectKeys.ToggleAll,
  Submit: MultiSelectKeys.Submit,
};

export const MultiSelect = <A>(
  options: Prompt.SelectOptions<A> & Prompt.MultiSelectOptions,
): Prompt.Prompt<Array<A>> => {
  const { message, choices } = options;
  const min = options.min ?? 0;
  const max = options.max ?? choices.length;

  const renderLayout = (state: MultiSelectState, submitted: boolean) => {
    const label = Box.text(message).pipe(Box.annotate(Ansi.bold));

    if (submitted) {
      const selectedTitles = choices
        .filter((_, i) => state.selected.has(i))
        .map((c) => c.title);
      const summary =
        selectedTitles.length === 0 ? "None" : selectedTitles.join(", ");
      return Box.hsep(
        [
          Box.text("✔").pipe(Box.annotate(Ansi.green)),
          label,
          Box.text(summary).pipe(Box.annotate(Ansi.cyan)),
        ],
        1,
        Box.top,
      );
    }

    const items = choices.map((c, i) => {
      const isCursor = i === state.cursor;
      const isChecked = state.selected.has(i);
      const checkbox = Box.char(isChecked ? "◼" : "◻").pipe(
        Box.annotate(isChecked ? Ansi.green : Ansi.dim),
      );
      const indicator = Box.char(isCursor ? ">" : " ").pipe(
        Box.annotate(Ansi.cyan),
      );
      const title = Box.text(c.title).pipe(
        Box.annotate(isChecked ? Ansi.green : Ansi.white),
      );
      const description =
        isCursor && c.description
          ? Box.text(c.description).pipe(Box.annotate(Ansi.dim))
          : Box.nullBox;

      return Box.hsep([indicator, checkbox, title, description], 1, Box.left);
    });

    const count = Box.text(`(${state.selected.size}/${choices.length})`).pipe(
      Box.annotate(Ansi.dim),
    );

    const content = Box.vcat(
      [Box.hsep([label, count], 1, Box.center1), Box.vcat(items, Box.left)],
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
        Hint(MultiSelectHintKeys),
      ],
      1,
      Box.left,
    ).pipe(Box.moveDown(1));
  };

  const initialSelected = new Set<number>(
    choices.map((c, i) => (c.selected ? i : -1)).filter((i) => i >= 0),
  );

  const initialState: MultiSelectState = {
    cursor: 0,
    selected: initialSelected,
    prevRows: 0,
  };

  return Prompt.custom<MultiSelectState, Array<A>>(initialState, {
    render: Effect.fnUntraced(function* (state, action) {
      const currentState = action._tag === "NextFrame" ? action.state : state;
      const layout = Action.$match(action, {
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
      const prevRows = renderLayout(state, false).rows;

      const next = (patch: Partial<MultiSelectState>) =>
        Action.NextFrame({ state: { ...state, prevRows, ...patch } });

      return Match.value(input).pipe(
        whenBinding(MultiSelectKeys.Down, () =>
          next({ cursor: (state.cursor + 1) % choices.length }),
        ),
        whenBinding(MultiSelectKeys.Up, () =>
          next({
            cursor: (state.cursor - 1 + choices.length) % choices.length,
          }),
        ),
        whenBinding(MultiSelectKeys.Toggle, () => {
          const choice = choices[state.cursor];
          if (choice?.disabled) return Action.Beep();
          const nextSet = new Set(state.selected);
          if (nextSet.has(state.cursor)) {
            nextSet.delete(state.cursor);
          } else {
            if (nextSet.size >= max) return Action.Beep();
            nextSet.add(state.cursor);
          }
          return next({ selected: nextSet });
        }),
        whenBinding(MultiSelectKeys.ToggleAll, () => {
          const allSelected = state.selected.size === choices.length;
          const nextSet = allSelected
            ? new Set<number>()
            : new Set<number>(choices.map((_, i) => i));
          return next({ selected: nextSet });
        }),
        whenBinding(MultiSelectKeys.Submit, () => {
          if (state.selected.size < min) return Action.Beep();
          const values = choices
            .filter((_, i) => state.selected.has(i))
            .map((c) => c.value);
          return Action.Submit({ value: values });
        }),
        Match.orElse(() => next({})),
      );
    }),
    clear: Effect.fnUntraced(function* (_state) {
      return "";
    }),
  });
};
