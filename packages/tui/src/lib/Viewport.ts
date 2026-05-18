/**
 * Viewport — a pure state machine for windowed content scrolling.
 *
 * Provides two modes:
 * - Active: consumes ScrollAction and returns new state (for dedicated scroll keys)
 * - Passive: derives scroll offset from cursor position (for cursor-driven scrolling)
 *
 * State is 2D (row + col) to support future horizontal scrolling,
 * but render currently only slices vertically.
 *
 * @module
 */
import { Option } from "effect";
import { Box } from "effect-boxes";
import type { AnsiStyle } from "effect-boxes/Ansi";

// ─── State ───────────────────────────────────────────────────────────────────

export interface State {
  readonly row: number;
  readonly col: number;
}

export const initial: State = { row: 0, col: 0 };

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ScrollAction = "up" | "down" | "left" | "right";

// ─── Bounds ──────────────────────────────────────────────────────────────────

export interface Bounds {
  readonly contentHeight: number;
  readonly visibleHeight: number;
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export interface ViewportMeta {
  readonly hasAbove: boolean;
  readonly hasBelow: boolean;
  readonly hasLeft: boolean;
  readonly hasRight: boolean;
  readonly offset: State;
  readonly contentHeight: number;
}

// ─── Active mode: consume scroll actions ─────────────────────────────────────

/**
 * Attempt to scroll in the given direction. Returns `Option.some(newState)` if
 * the action was consumed (offset changed), or `Option.none()` if the viewport
 * is already at its boundary.
 */
export const scroll = (
  state: State,
  action: ScrollAction,
  bounds: Bounds,
): Option.Option<State> => {
  const maxRow = Math.max(0, bounds.contentHeight - bounds.visibleHeight);

  switch (action) {
    case "up": {
      if (state.row <= 0) return Option.none();
      return Option.some({ ...state, row: state.row - 1 });
    }
    case "down": {
      if (state.row >= maxRow) return Option.none();
      return Option.some({ ...state, row: state.row + 1 });
    }
    case "left": {
      if (state.col <= 0) return Option.none();
      return Option.some({ ...state, col: state.col - 1 });
    }
    case "right": {
      // No horizontal bounds yet — allow unbounded right scroll
      return Option.some({ ...state, col: state.col + 1 });
    }
  }
};

// ─── Passive mode: follow cursor ─────────────────────────────────────────────

/**
 * Adjust the viewport offset so that `cursorRow` is visible within the window.
 * Does not change state if the cursor is already visible.
 */
export const scrollToReveal = (
  state: State,
  cursorRow: number,
  visibleHeight: number,
): State => {
  if (cursorRow < state.row) return { ...state, row: cursorRow };
  if (cursorRow >= state.row + visibleHeight) {
    return { ...state, row: cursorRow - visibleHeight + 1 };
  }
  return state;
};

// ─── Render ──────────────────────────────────────────────────────────────────

export interface RenderResult {
  readonly items: ReadonlyArray<Box.Box<AnsiStyle>>;
  readonly meta: ViewportMeta;
}

/**
 * Slice the items array through the viewport window, returning the visible
 * items and metadata about scroll position.
 */
export const render = (
  items: ReadonlyArray<Box.Box<AnsiStyle>>,
  state: State,
  visibleHeight: number,
): RenderResult => {
  const contentHeight = items.length;
  const clampedRow = Math.max(
    0,
    Math.min(state.row, Math.max(0, contentHeight - visibleHeight)),
  );

  return {
    items: items.slice(clampedRow, clampedRow + visibleHeight),
    meta: {
      hasAbove: clampedRow > 0,
      hasBelow: clampedRow + visibleHeight < contentHeight,
      hasLeft: state.col > 0,
      hasRight: false, // horizontal render not yet implemented
      offset: { row: clampedRow, col: state.col },
      contentHeight,
    },
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pre-render a Box into an array of single-line Box items suitable for
 * viewport slicing. Use this when your content is a rich Box (e.g., Confirm's
 * children) rather than an already-structured list of items.
 */
export const linesFromBox = (
  box: Box.Box<AnsiStyle>,
): ReadonlyArray<Box.Box<AnsiStyle>> =>
  Box.renderPrettySync(box)
    .split("\n")
    .map((l) => Box.line(l));
