import { Array as Arr, pipe } from "effect";
import { Box } from "effect-boxes";

export const Border = <A>(self: Box.Box<A>): Box.Box<A> => {
  const middleBorder = pipe(
    Arr.makeBy(self.rows, () => Box.char("│")),
    Box.vcat(Box.left),
  );
  const topBorder = pipe(
    [Box.char("╭"), Box.text("─".repeat(self.cols)), Box.char("╮")],
    Box.hcat(Box.top),
  );
  const bottomBorder = pipe(
    [Box.char("╰"), Box.text("─".repeat(self.cols)), Box.char("╯")],
    Box.hcat(Box.top),
  );
  const middleSection = pipe(
    [middleBorder, self, middleBorder],
    Box.hcat(Box.top),
  );
  return pipe([topBorder, middleSection, bottomBorder], Box.vcat(Box.left));
};
