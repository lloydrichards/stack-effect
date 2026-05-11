import { Data, Effect } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

export const HorizontalSelect = <A extends string>(
  options: Prompt.SelectOptions<A>,
): Prompt.Prompt<A> => {
  const { message, choices } = options;

  const renderLayout = (cursor: number, submitted: boolean) => {
    const prefix = submitted
      ? Box.text("✔").pipe(Box.annotate(Ansi.green))
      : Box.text("?").pipe(Box.annotate(Ansi.cyan));

    const label = Box.text(message).pipe(Box.annotate(Ansi.bold));

    const items = choices.map((c, i) => {
      const isSelected = i === cursor;

      return Box.text(c.title).pipe(
        Box.pad(0, 2),
        Box.border("rounded"),
        Box.annotate(
          isSelected ? Ansi.combine(Ansi.cyan, Ansi.bold) : Ansi.dim,
        ),
      );
    });

    if (submitted) {
      const selected = choices[cursor];
      return Box.hsep(
        [
          prefix,
          label,
          Box.text(selected?.title ?? "").pipe(Box.annotate(Ansi.cyan)),
        ],
        1,
        Box.top,
      );
    }

    const content = Box.vcat(
      [
        Box.hsep([prefix, label, Box.text(" ")], 2, Box.center1),
        Box.hsep(items, 2, Box.center1),
      ],
      Box.left,
    );

    const hint = Box.punctuateH(
      [
        Box.text("←/→ Toggle"),
        Box.text("enter select"),
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

  return Prompt.custom<number, A>(0, {
    render: (cursor, action) => {
      const layout = Action.$match(action, {
        Beep: () => renderLayout(cursor, false),
        Submit: () => renderLayout(cursor, true),
        NextFrame: ({ state }) => renderLayout(state, false),
        default: () => renderLayout(cursor, false),
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
    process: (input, cursor) => {
      switch (input.key.name) {
        case "right":
        case "l":
        case "tab":
          return Effect.succeed(
            Action.NextFrame({ state: (cursor + 1) % choices.length }),
          );
        case "left":
        case "h":
          return Effect.succeed(
            Action.NextFrame({
              state: (cursor - 1 + choices.length) % choices.length,
            }),
          );
        case "enter":
        case "return": {
          const selected = choices[cursor];
          if (selected) {
            return Effect.succeed(Action.Submit({ value: selected.value }));
          }
          return Effect.succeed(Action.Beep());
        }
        default:
          return Effect.succeed(Action.NextFrame({ state: cursor }));
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
