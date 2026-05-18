import { Array as Arr, Order, pipe } from "effect";
import { Box } from "effect-boxes";

// ─── Breakpoint ──────────────────────────────────────────────────────────────

export interface BreakpointEntry<A = never> {
  /** Minimum container width for this layout to apply */
  readonly minWidth: number;
  /** Builder that produces the layout for this breakpoint */
  readonly render: () => Box.Box<A>;
}

/**
 * Select a layout based on container width (largest matching breakpoint wins).
 * Entries are evaluated from largest minWidth to smallest.
 *
 * @example
 * ```typescript
 * Breakpoint.select(terminalWidth, [
 *   { minWidth: 100, render: () => wideLayout },
 *   { minWidth: 60,  render: () => mediumLayout },
 *   { minWidth: 0,   render: () => narrowLayout },
 * ])
 * ```
 */
export const Breakpoint = {
  select: <A>(
    containerWidth: number,
    entries: ReadonlyArray<BreakpointEntry<A>>,
  ): Box.Box<A> =>
    pipe(
      entries,
      Arr.sort(
        Order.mapInput(
          Order.flip(Order.Number),
          (e: BreakpointEntry<A>) => e.minWidth,
        ),
      ),
      Arr.findFirst((e) => containerWidth >= e.minWidth),
      (match) => (match._tag === "Some" ? match.value.render() : Box.nullBox),
    ),
};
