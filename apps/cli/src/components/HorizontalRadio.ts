import { Data, Effect } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box } from "effect-boxes";
import { Border } from "./Border";
import { Padding } from "./Padding";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

// TODO: replace with clearLines in v0.11.0 of effect-boxes
const ESC = "\x1B[";
const eraseLines = (rows: number): string => {
  let command = "";
  for (let i = 0; i < rows; i++) {
    command += `${ESC}2K` + (i < rows - 1 ? `${ESC}1A` : "");
  }
  if (rows > 0) {
    command += `${ESC}G`;
  }
  return command;
};

export const HorizontalRadio = <A extends string>(
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
        Padding(0, 2),
        Border,
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

    return Box.vcat(
      [
        Box.hsep([prefix, label, Box.text(" ")], 2, Box.center1),
        Box.hsep(items, 2, Box.center1),
      ],
      Box.left,
    );
  };

  return Prompt.custom<number, A>(0, {
    render: (cursor, action) => {
      const layout = Action.$match(action, {
        Beep: () => renderLayout(cursor, false),
        Submit: () => renderLayout(cursor, true),
        NextFrame: ({ state }) => renderLayout(state, false),
        default: () => renderLayout(cursor, false),
      });
      const rendered = Box.renderPrettySync(layout);
      return Effect.succeed(
        action._tag === "Submit" ? `${rendered}\n` : rendered,
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
        return eraseLines(renderLayout(_state, false).rows);
      }),
  });
};
