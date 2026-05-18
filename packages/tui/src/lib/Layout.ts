/**
 * Layout — responsive layout helpers built on top of Box.
 *
 * Provides container-aware composition primitives inspired by CSS Flexbox:
 * - `Flex.row` / `Flex.col` — distribute space among children
 * - `Breakpoint` — switch layout based on container width
 * - `Container` — pass available dimensions to child builders
 * - `Grid` — fixed-column grid layout
 * - `Row` / `Col` — ergonomic wrappers for hsep/vsep
 *
 * All helpers are pure functions that return standard Box values,
 * composable with existing Box primitives (border, annotate, pad, etc).
 *
 * @module
 */
import { Array as Arr, Order, pipe } from "effect";
import { Box } from "effect-boxes";

// ─── Flex Internals ──────────────────────────────────────────────────────────

const flexFactor = <A>(child: FlexChild<A>): number =>
  child._tag === "Fixed" ? 0 : child.factor;

const flexFixedSize = <A>(
  child: FlexChild<A>,
  measure: (box: Box.Box<A>) => number,
): number => (child._tag === "Fixed" ? measure(child.box) : 0);

const resolveFlexChildren = <A>(
  children: ReadonlyArray<FlexChild<A>>,
  available: number,
  totalFactor: number,
  alignFn: (box: Box.Box<A>, size: number) => Box.Box<A>,
): Box.Box<A>[] =>
  Arr.map(children, (child) => {
    if (child._tag === "Fixed") return child.box;
    const size =
      totalFactor > 0
        ? Math.max(1, Math.floor((child.factor / totalFactor) * available))
        : 1;
    if (child._tag === "Fill") return child.builder(size);
    return alignFn(child.box, size);
  });

// ─── Flex ────────────────────────────────────────────────────────────────────

/**
 * A flex child that occupies its intrinsic width/height.
 */
export interface FlexFixed<A = never> {
  readonly _tag: "Fixed";
  readonly box: Box.Box<A>;
}

/**
 * A flex child that grows to fill remaining space.
 * `factor` controls proportional distribution (default 1).
 */
export interface FlexGrow<A = never> {
  readonly _tag: "Grow";
  readonly box: Box.Box<A>;
  readonly factor: number;
}

/**
 * A flex child that fills remaining space via a builder function.
 * The builder receives the allocated width/height so content can
 * be constructed to fit exactly.
 */
export interface FlexFill<A = never> {
  readonly _tag: "Fill";
  readonly builder: (size: number) => Box.Box<A>;
  readonly factor: number;
}

export type FlexChild<A = never> = FlexFixed<A> | FlexGrow<A> | FlexFill<A>;

export const Flex = {
  /**
   * Mark a child as fixed-size (uses intrinsic width/height).
   */
  fixed: <A>(box: Box.Box<A>): FlexChild<A> => ({ _tag: "Fixed", box }),

  /**
   * Mark a child as growable — it will expand to fill remaining space.
   * @param factor - Proportional growth factor (default 1)
   */
  grow: <A>(box: Box.Box<A>, factor = 1): FlexChild<A> => ({
    _tag: "Grow",
    box,
    factor,
  }),

  /**
   * Fill remaining space using a builder that receives the allocated size.
   * Unlike `grow`, the builder can construct content that fills exactly.
   * @param builder - Receives allocated width (for row) or height (for col)
   * @param factor - Proportional growth factor (default 1)
   */
  fill: <A>(
    builder: (size: number) => Box.Box<A>,
    factor = 1,
  ): FlexChild<A> => ({
    _tag: "Fill",
    builder,
    factor,
  }),

  /**
   * Lay out children horizontally within a fixed container width.
   * Fixed children keep their intrinsic width; grow children share
   * the remaining space proportionally.
   *
   * @example
   * ```typescript
   * Flex.row(80, [
   *   Flex.fixed(Box.text("Name")),
   *   Flex.grow(Box.text("...")),
   *   Flex.fixed(Box.text("100%")),
   * ])
   * ```
   */
  row: <A>(
    containerWidth: number,
    children: ReadonlyArray<FlexChild<A>>,
    options?: { readonly align?: Box.Alignment; readonly gap?: number },
  ): Box.Box<A> => {
    const align = options?.align ?? Box.top;
    const gap = options?.gap ?? 0;

    const totalGap = gap * Math.max(0, children.length - 1);
    const fixedWidth = Arr.reduce(
      children,
      0,
      (sum, c) => sum + flexFixedSize(c, Box.cols),
    );
    const available = Math.max(0, containerWidth - fixedWidth - totalGap);
    const totalFactor = Arr.reduce(
      children,
      0,
      (sum, c) => sum + flexFactor(c),
    );

    const sized = resolveFlexChildren(
      children,
      available,
      totalFactor,
      (box, w) => box.pipe(Box.alignHoriz(Box.left, w)),
    );

    return gap > 0 ? Box.hsep(sized, gap, align) : Box.hcat(sized, align);
  },

  /**
   * Lay out children vertically within a fixed container height.
   * Fixed children keep their intrinsic height; grow children share
   * the remaining space proportionally.
   */
  col: <A>(
    containerHeight: number,
    children: ReadonlyArray<FlexChild<A>>,
    options?: { readonly align?: Box.Alignment; readonly gap?: number },
  ): Box.Box<A> => {
    const align = options?.align ?? Box.left;
    const gap = options?.gap ?? 0;

    const totalGap = gap * Math.max(0, children.length - 1);
    const fixedHeight = Arr.reduce(
      children,
      0,
      (sum, c) => sum + flexFixedSize(c, Box.rows),
    );
    const available = Math.max(0, containerHeight - fixedHeight - totalGap);
    const totalFactor = Arr.reduce(
      children,
      0,
      (sum, c) => sum + flexFactor(c),
    );

    const sized = resolveFlexChildren(
      children,
      available,
      totalFactor,
      (box, h) => box.pipe(Box.alignVert(Box.top, h)),
    );

    return gap > 0 ? Box.vsep(sized, gap, align) : Box.vcat(sized, align);
  },
} as const;

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

// ─── Container ───────────────────────────────────────────────────────────────

export interface ContainerContext {
  /** Total container width */
  readonly width: number;
  /** Total container height (when known) */
  readonly height: number;
  /** Usable width after padding */
  readonly innerWidth: number;
  /** Usable height after padding */
  readonly innerHeight: number;
}

/**
 * Provide container dimensions to a child builder function.
 * Automatically computes inner dimensions after padding.
 *
 * @example
 * ```typescript
 * Container.make(
 *   { width: terminalWidth, height: terminalHeight, padding: 2 },
 *   (ctx) => Flex.row(ctx.innerWidth, [
 *     Flex.fixed(sidebar),
 *     Flex.grow(mainContent),
 *   ])
 * )
 * ```
 */
export const Container = {
  make: <A>(
    options: {
      readonly width: number;
      readonly height?: number;
      readonly padding?: number | readonly [number, number];
      readonly paddingX?: number;
      readonly paddingY?: number;
    },
    builder: (ctx: ContainerContext) => Box.Box<A>,
  ): Box.Box<A> => {
    const height = options.height ?? 0;
    const [py, px] =
      options.padding != null
        ? typeof options.padding === "number"
          ? [options.padding, options.padding]
          : options.padding
        : [options.paddingY ?? 0, options.paddingX ?? 0];

    const ctx: ContainerContext = {
      width: options.width,
      height,
      innerWidth: Math.max(0, options.width - px * 2),
      innerHeight: Math.max(0, height - py * 2),
    };

    const content = builder(ctx);
    return py > 0 || px > 0 ? content.pipe(Box.pad(py, px)) : content;
  },
};

// ─── Grid ────────────────────────────────────────────────────────────────────

/**
 * Arrange items in a fixed-column grid.
 *
 * @example
 * ```typescript
 * Grid.make(items.map(Box.text), {
 *   cols: 3,
 *   colWidth: 25,
 *   gap: [1, 1],
 * })
 * ```
 */
export const Grid = {
  make: <A>(
    items: ReadonlyArray<Box.Box<A>>,
    options: {
      readonly cols: number;
      readonly colWidth: number;
      readonly gap?: readonly [number, number];
      readonly align?: Box.Alignment;
      readonly stretch?: boolean;
    },
  ): Box.Box<A> => {
    const { cols, colWidth } = options;
    const [hGap, vGap] = options.gap ?? [1, 0];
    const align = options.align ?? Box.left;
    const stretch = options.stretch ?? false;

    const sizeCell = (item: Box.Box<A>) =>
      stretch
        ? item.pipe(Box.minWidth(colWidth), Box.alignHoriz(align, colWidth))
        : item.pipe(Box.alignHoriz(align, colWidth));

    const padRow = (row: Box.Box<A>[]): Box.Box<A>[] =>
      row.length < cols
        ? [
            ...row,
            ...Arr.makeBy(cols - row.length, () => Box.emptyBox(1, colWidth)),
          ]
        : row;

    const rowBoxes = pipe(
      Arr.chunksOf(items, cols),
      Arr.map((chunk) =>
        pipe(Arr.map(chunk, sizeCell), padRow, (cells) =>
          Box.hsep(cells, hGap, Box.top),
        ),
      ),
    );

    return Box.vsep(rowBoxes, vGap, Box.left);
  },

  /**
   * Auto-calculate column count from container width.
   */
  auto: <A>(
    containerWidth: number,
    items: ReadonlyArray<Box.Box<A>>,
    options: {
      /** Minimum width per column */
      readonly minColWidth: number;
      /** Maximum width per column (prevents over-stretching on wide terminals) */
      readonly maxColWidth?: number;
      /** Gap between columns */
      readonly gap?: number;
      /** Alignment within cells */
      readonly align?: Box.Alignment;
      /** Stretch items to fill cell width (default false) */
      readonly stretch?: boolean;
    },
  ): Box.Box<A> => {
    const gap = options.gap ?? 1;
    const cols = Math.min(
      items.length,
      Math.max(
        1,
        Math.floor((containerWidth + gap) / (options.minColWidth + gap)),
      ),
    );
    let colWidth = Math.floor((containerWidth - (cols - 1) * gap) / cols);
    if (options.maxColWidth != null) {
      colWidth = Math.min(colWidth, options.maxColWidth);
    }

    return Grid.make(items, {
      cols,
      colWidth,
      gap: [gap, 0],
      ...(options.align != null ? { align: options.align } : {}),
      ...(options.stretch != null ? { stretch: options.stretch } : {}),
    });
  },
} as const;
