/**
 * Hint — shared hint bar rendering for prompt components.
 *
 * Renders a horizontal list of key bindings as a dim hint bar below prompt
 * content. Keys are rendered bold to visually distinguish them from action text.
 *
 * @module
 */
import { Ansi, Box } from "effect-boxes";
import type { AnsiStyle } from "effect-boxes/Ansi";
import type { KeyBinding, KeyMap } from "../lib/KeyBinding.js";

// ─── Kbd ─────────────────────────────────────────────────────────────────────

/**
 * Render a single key binding as `**key** action` (bold key, normal action).
 */
export const Kbd = (binding: KeyBinding): Box.Box<AnsiStyle> =>
  Box.hcat(
    [
      Box.text(binding["label"]).pipe(Box.annotate(Ansi.bold)),
      Box.text(` ${binding["action"]}`),
    ],
    Box.left,
  );

// ─── Hint ────────────────────────────────────────────────────────────────────

/**
 * Render a keymap as a horizontal hint bar.
 *
 * Only enabled bindings are shown. The bar is indented and dimmed to sit below
 * prompt content.
 *
 * ```ts
 * const hint = Hint(SelectKeys);
 * // => "↑ up • ↓ down • enter select"  (dimmed, indented)
 * ```
 */
export const Hint = (keymap: KeyMap): Box.Box<AnsiStyle> =>
  Box.punctuateH(
    Object.values(keymap)
      .filter((b) => b["enabled"] ?? true)
      .map(Kbd),
    Box.left,
    Box.text(" • "),
  ).pipe(Box.moveRight(2), Box.annotate(Ansi.dim));
