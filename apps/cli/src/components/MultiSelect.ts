import { Data, Effect, Match } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

interface MultiSelectState {
  readonly cursor: number;
  readonly selected: ReadonlySet<number>;
}

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

    const hint = Box.punctuateH(
      [
        Box.text("↑/↓ navigate"),
        Box.text("space toggle"),
        Box.text("a toggle all"),
        Box.text("enter submit"),
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

  const initialSelected = new Set<number>(
    choices.map((c, i) => (c.selected ? i : -1)).filter((i) => i >= 0),
  );

  const initialState: MultiSelectState = {
    cursor: 0,
    selected: initialSelected,
  };

  return Prompt.custom<MultiSelectState, Array<A>>(initialState, {
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
      return Match.value(input.key.name).pipe(
        Match.whenOr("down", "j", "tab", () =>
          Action.NextFrame({
            state: {
              ...state,
              cursor: (state.cursor + 1) % choices.length,
            },
          }),
        ),
        Match.whenOr("up", "k", () =>
          Action.NextFrame({
            state: {
              ...state,
              cursor: (state.cursor - 1 + choices.length) % choices.length,
            },
          }),
        ),
        Match.when("space", () => {
          const choice = choices[state.cursor];
          if (choice?.disabled) return Action.Beep();
          const next = new Set(state.selected);
          if (next.has(state.cursor)) {
            next.delete(state.cursor);
          } else {
            if (next.size >= max) return Action.Beep();
            next.add(state.cursor);
          }
          return Action.NextFrame({ state: { ...state, selected: next } });
        }),
        Match.when("a", () => {
          const allSelected = state.selected.size === choices.length;
          const next = allSelected
            ? new Set<number>()
            : new Set<number>(choices.map((_, i) => i));
          return Action.NextFrame({ state: { ...state, selected: next } });
        }),
        Match.whenOr("enter", "return", () => {
          if (state.selected.size < min) return Action.Beep();
          const values = choices
            .filter((_, i) => state.selected.has(i))
            .map((c) => c.value);
          return Action.Submit({ value: values });
        }),
        Match.orElse(() => Action.NextFrame({ state })),
      );
    }),
    clear: Effect.fnUntraced(function* (state) {
      return yield* Box.renderPretty(
        Cmd.clearLines(renderLayout(state, false).rows),
      );
    }),
  });
};
