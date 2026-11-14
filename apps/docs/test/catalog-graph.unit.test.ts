import { it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { Effect } from "effect";
import { expect } from "vitest";
import { testCatalog } from "../../../packages/catalog/src/testCatalog";
import {
  buildExplorerGraph,
  layoutGraph,
} from "../app/components/catalog-graph/model";

it.effect(
  "preserves conflicts and dependencies with valid endpoints and a reproducible force layout",
  () =>
    Effect.gen(function* () {
      const graph = yield* Effect.gen(function* () {
        return buildExplorerGraph(yield* CatalogService);
      }).pipe(Effect.provide(CatalogService.fromFragments([testCatalog])));
      const ids = new Set(graph.nodes.map((n) => n.id));
      expect(graph.edges.some((e) => e.kind === "conflicts")).toBe(true);
      expect(graph.edges.some((e) => e.kind === "requires")).toBe(true);
      expect(
        graph.edges.every((e) => ids.has(e.source) && ids.has(e.target)),
      ).toBe(true);
      const positions = layoutGraph(graph);
      expect(positions).toEqual(layoutGraph(graph));
      expect(
        positions.every(
          (p) => p.x >= 79 && p.x <= 921 && p.y >= 79 && p.y <= 641,
        ),
      ).toBe(true);
      expect(
        positions.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      ).toBe(true);
      expect(layoutGraph({ nodes: [], edges: [] })).toEqual([]);
    }),
);
