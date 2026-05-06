import { Array as Arr, Data, Effect, pipe } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { Padding } from "./Padding";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

export const Confirm = (
  options: Prompt.ConfirmOptions,
): Prompt.Prompt<boolean> => {
  const message = options.message;
  const initialValue = options.initial ?? false;
  const confirmLabel = options.label?.confirm ?? "Yes";
  const denyLabel = options.label?.deny ?? "No";

  const choices = [
    { title: confirmLabel, value: true },
    { title: denyLabel, value: false },
  ] as const;

  const renderLayout = (cursor: number, submitted: boolean) => {
    const items = choices.map((c, i) => {
      const isSelected = i === cursor;

      return Box.text(c.title).pipe(
        Padding(0, 1),
        Box.annotate(
          isSelected
            ? Ansi.combine(Ansi.bgCyan, Ansi.bold)
            : Ansi.bgColorRGB(50, 50, 50),
        ),
      );
    });

    if (submitted) {
      return Box.emptyBox();
    }

    const content = Box.vsep(
      [
        Box.text(message).pipe(Box.annotate(Ansi.bold)),
        Box.hsep(items, 2, Box.center1),
      ],
      1,
      Box.left,
    );

    const verticalLine = pipe(
      Arr.makeBy(content.rows, () => Box.char("│")),
      Box.vcat(Box.left),
      Box.annotate(Ansi.dim),
    );

    const hint = Box.punctuateH(
      [Box.text("←/→ Toggle"), Box.text("enter next"), Box.text("esc cancel")],
      Box.left,
      Box.text(" ┆ "),
    ).pipe(Box.moveRight(2), Box.annotate(Ansi.dim));

    return Box.vsep(
      [Box.hsep([verticalLine, content], 1, Box.left), hint],
      1,
      Box.left,
    ).pipe(Box.moveDown(1));
  };

  const initialCursor = initialValue ? 0 : 1;

  return Prompt.custom<number, boolean>(initialCursor, {
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
              action._tag === "Submit" ? Cmd.cursorShow : Cmd.cursorHide,
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
        case "escape":
          return Effect.succeed(Action.Submit({ value: false }));
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
