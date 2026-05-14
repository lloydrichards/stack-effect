import { Data, Effect, Match } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

export const Select = <A>(
  options: Prompt.SelectOptions<A>,
): Prompt.Prompt<A> => {
  const { message, choices } = options;

  const renderLayout = (cursor: number, submitted: boolean) => {
    const label = Box.text(message).pipe(Box.annotate(Ansi.bold));

    const items = choices.map((c, i) => {
      const isSelected = i === cursor;
      const indicator = isSelected ? "> " : "  ";
      return Box.text(`${indicator}${c.title}`).pipe(
        Box.annotate(
          isSelected ? Ansi.combine(Ansi.cyan, Ansi.bold) : Ansi.dim,
        ),
      );
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

    const hint = Box.punctuateH(
      [Box.text("↑ up"), Box.text("↓ down"), Box.text("enter select")],
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

  return Prompt.custom<number, A>(0, {
    render: Effect.fnUntraced(function* (cursor, action) {
      const layout = Action.$match(action, {
        Beep: () => renderLayout(cursor, false),
        Submit: () => renderLayout(cursor, true),
        NextFrame: ({ state }) => renderLayout(state, false),
        default: () => renderLayout(cursor, false),
      });

      const cmds =
        action._tag === "Submit"
          ? Box.combine(Cmd.cursorShow, Cmd.cursorNextLine(1))
          : Cmd.cursorHide;

      return yield* Box.renderPretty(layout.pipe(Box.combine(cmds)));
    }),
    process: Effect.fnUntraced(function* (input, cursor) {
      return Match.value(input.key.name).pipe(
        Match.whenOr("down", "j", "tab", () =>
          Action.NextFrame({ state: (cursor + 1) % choices.length }),
        ),
        Match.whenOr("up", "k", () =>
          Action.NextFrame({
            state: (cursor - 1 + choices.length) % choices.length,
          }),
        ),
        Match.whenOr("enter", "return", () => {
          const selected = choices[cursor];
          if (selected) {
            return Action.Submit({ value: selected.value });
          }
          return Action.Beep();
        }),
        Match.orElse(() => Action.NextFrame({ state: cursor })),
      );
    }),
    clear: Effect.fnUntraced(function* (state) {
      return yield* Box.renderPretty(
        Cmd.clearLines(renderLayout(state, false).rows),
      );
    }),
  });
};
