import { pipe } from "effect";
import { Box } from "effect-boxes";

export const Padding =
  <A>(vertical: number, horizontal?: number) =>
  (self: Box.Box<A>) => {
    const h = horizontal ?? vertical;
    return pipe(
      self,
      Box.moveUp(vertical),
      Box.moveDown(vertical),
      Box.moveLeft(h),
      Box.moveRight(h),
    );
  };
