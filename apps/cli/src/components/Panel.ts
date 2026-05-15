import { dual } from "effect/Function";
import { Box, type Box as BoxType } from "effect-boxes";

// ─── Panel ───────────────────────────────────────────────────────────────────

type BoxOperator = (box: BoxType.Box<unknown>) => BoxType.Box<unknown>;
type PanelOptions = {
  readonly padding?: BoxOperator;
  readonly border?: BoxOperator;
  readonly margin?: BoxOperator;
};

/**
 * Creates a bordered, padded section by composing Box operators in
 * CSS box-model order: content → padding → border → margin.
 *
 * Accepts any `BoxOperator` for each layer, giving full control over
 * border style, padding shape, and outer spacing without Panel needing
 * to know about annotation, sides, or other border options.
 *
 * If no `border` operator is provided, defaults to `Box.border("rounded")`.
 *
 * @example
 * ```typescript
 * import { pipe } from "effect"
 * import { Box } from "effect-boxes"
 * import { Panel } from "./Panel"
 *
 * // Data-first: pass box and options directly
 * const card = Panel.make(Box.text("Hello"), {
 *   padding: Box.pad(0, 1),
 *   border: Box.border("rounded"),
 * })
 *
 * // Data-last: use with pipe
 * const info = pipe(
 *   Box.text("Status: OK"),
 *   Panel.make({
 *     padding: Box.pad(1),
 *     border: Box.border("single", { annotation: Ansi.green }),
 *     margin: Box.pad(0, 1),
 *   })
 * )
 *
 * // Partial borders via Box.border options
 * const sidebar = pipe(
 *   Box.text("Menu"),
 *   Panel.make({
 *     padding: Box.pad(0, 1),
 *     border: Box.border("rounded", { sides: { right: false } }),
 *   })
 * )
 * ```
 */
export const Panel = {
  make: dual<
    <A>(options?: PanelOptions) => (self: Box.Box<A>) => Box.Box<A>,
    <A>(self: Box.Box<A>, options?: PanelOptions) => Box.Box<A>
  >(2, <A>(self: Box.Box<A>, options?: PanelOptions): Box.Box<A> => {
    const ops: Array<BoxOperator> = [
      options?.padding,
      options?.border ?? Box.border("rounded"),
      options?.margin,
    ].filter((op): op is BoxOperator => op != null);

    return ops.reduce((box, op) => op(box), self as BoxType.Box<unknown>) as BoxType.Box<A>;
  }),
};
