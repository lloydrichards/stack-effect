import { expect, test } from "vitest";
import type { CanvasNode } from "../app/components/catalog-prototypes/layout";
import { displayNode } from "../app/components/catalog-prototypes/module-node";
import {
  detailLevel,
  organicVariants,
} from "../app/components/catalog-prototypes/variants";

const node: CanvasNode = {
  id: "catalog:example",
  title: "A readable module",
  subtitle: "example",
  source: "official",
  kind: "client",
  status: "catalog",
  x: 200,
  y: 400,
  width: 260,
  height: 96,
  minY: 0,
  maxY: Infinity,
};
test("semantic zoom progresses from target overview to names, relationships, and descriptions", () => {
  organicVariants.forEach((variant) => {
    expect(detailLevel(0.15, variant.id)).toBe("map");
    expect(detailLevel(0.4, variant.id)).toBe("names");
    expect(detailLevel(variant.contextScale, variant.id)).toBe("context");
    expect(detailLevel(variant.detailScale + 0.05, variant.id)).toBe("detail");
  });
  expect(detailLevel(0.75, "ribbon")).toBe("names");
  expect(detailLevel(0.75, "lanes")).toBe("detail");
});
test("expanding detail preserves the node center and readable overview hit targets", () => {
  const names = displayNode(node, 0.4, "names", false);
  const detail = displayNode(node, 1.2, "detail", false);
  [names, detail].forEach((result) => {
    expect(result.x + result.width / 2).toBe(node.x + node.width / 2);
    expect(result.y + result.height / 2).toBe(node.y + node.height / 2);
  });
  expect(names.width * 0.4).toBeGreaterThanOrEqual(120);
  expect(names.height * 0.4).toBeGreaterThanOrEqual(62);
  expect(detail.height).toBeGreaterThan(node.height);
});
