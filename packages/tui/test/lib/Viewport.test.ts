import { assert, describe, it } from "@effect/vitest";
import { Option } from "effect";
import { Box } from "effect-boxes";
import * as Viewport from "../../src/lib/Viewport.js";

describe("Viewport", () => {
  describe("scroll (active mode)", () => {
    const bounds: Viewport.Bounds = { contentHeight: 20, visibleHeight: 5 };

    it("scrolls down from initial", () => {
      const result = Viewport.scroll(Viewport.initial, "down", bounds);
      assert.deepStrictEqual(result, Option.some({ row: 1, col: 0 }));
    });

    it("scrolls up from row 3", () => {
      const state: Viewport.State = { row: 3, col: 0 };
      const result = Viewport.scroll(state, "up", bounds);
      assert.deepStrictEqual(result, Option.some({ row: 2, col: 0 }));
    });

    it("returns none when scrolling up at top", () => {
      const result = Viewport.scroll(Viewport.initial, "up", bounds);
      assert.isTrue(Option.isNone(result));
    });

    it("returns none when scrolling down at bottom", () => {
      const state: Viewport.State = { row: 15, col: 0 }; // maxRow = 20 - 5 = 15
      const result = Viewport.scroll(state, "down", bounds);
      assert.isTrue(Option.isNone(result));
    });

    it("scrolls right unbounded", () => {
      const result = Viewport.scroll(Viewport.initial, "right", bounds);
      assert.deepStrictEqual(result, Option.some({ row: 0, col: 1 }));
    });

    it("returns none when scrolling left at col 0", () => {
      const result = Viewport.scroll(Viewport.initial, "left", bounds);
      assert.isTrue(Option.isNone(result));
    });
  });

  describe("scrollToReveal (passive mode)", () => {
    it("does not change state when cursor is visible", () => {
      const state: Viewport.State = { row: 5, col: 0 };
      const result = Viewport.scrollToReveal(state, 7, 5);
      assert.deepStrictEqual(result, state);
    });

    it("scrolls up when cursor is above viewport", () => {
      const state: Viewport.State = { row: 5, col: 0 };
      const result = Viewport.scrollToReveal(state, 3, 5);
      assert.deepStrictEqual(result, { row: 3, col: 0 });
    });

    it("scrolls down when cursor is below viewport", () => {
      const state: Viewport.State = { row: 5, col: 0 };
      const result = Viewport.scrollToReveal(state, 12, 5);
      assert.deepStrictEqual(result, { row: 8, col: 0 });
    });
  });

  describe("render", () => {
    const items = Array.from({ length: 10 }, (_, i) => Box.text(`line-${i}`));

    it("slices items to visible window", () => {
      const result = Viewport.render(items, { row: 2, col: 0 }, 3);
      assert.strictEqual(result.items.length, 3);
      assert.isTrue(result.meta.hasAbove);
      assert.isTrue(result.meta.hasBelow);
    });

    it("reports hasAbove=false at top", () => {
      const result = Viewport.render(items, Viewport.initial, 3);
      assert.isFalse(result.meta.hasAbove);
      assert.isTrue(result.meta.hasBelow);
    });

    it("reports hasBelow=false at bottom", () => {
      const result = Viewport.render(items, { row: 7, col: 0 }, 3);
      assert.isFalse(result.meta.hasBelow);
      assert.isTrue(result.meta.hasAbove);
    });

    it("clamps row to valid range", () => {
      const result = Viewport.render(items, { row: 100, col: 0 }, 3);
      assert.strictEqual(result.items.length, 3);
      assert.strictEqual(result.meta.offset.row, 7); // max = 10 - 3
    });
  });
});
