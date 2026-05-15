import { dual } from "effect/Function";
import { Ansi, Box, type Box as BoxType } from "effect-boxes";

// ─── Panel ───────────────────────────────────────────────────────────────────

type BoxOperator = (box: BoxType.Box<any>) => BoxType.Box<any>;
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

    return ops.reduce((box, op) => op(box), self);
  }),
};

// ─── PromptChrome ────────────────────────────────────────────────────────────

/**
 * Shared prompt wrapper used by all interactive prompt components.
 * Applies a left-side thick border with inner left-padding, plus
 * consistent top/bottom margin (1 row each), matching the standard
 * prompt chrome pattern.
 *
 * @param annotation - Border colour, defaults to `Ansi.dim`
 *
 * @example
 * ```typescript
 * import { pipe } from "effect"
 * import { Ansi, Box } from "effect-boxes"
 * import { PromptChrome } from "./Panel"
 *
 * const wrapped = pipe(content, PromptChrome())
 * const errorWrapped = pipe(content, PromptChrome(Ansi.red))
 * ```
 */
export const PromptChrome = (annotation: Ansi.AnsiAnnotation = Ansi.dim) =>
  Panel.make({
    padding: Box.pad(0, 0, 0, 1),
    border: Box.border("thick", {
      annotation,
      sides: { top: false, bottom: false, right: false },
    }),
    margin: Box.pad(1, 0),
  });
