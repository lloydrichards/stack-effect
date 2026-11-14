import { CatalogFragment } from "@repo/domain/Catalog";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { prototypeLayout } from "../app/components/catalog-prototypes/layout";
import { continuingNodes } from "../app/components/catalog-prototypes/node-continuity";
import { createOrganicWorld } from "../app/components/catalog-prototypes/organic-forces";
import {
  addPick,
  emptySelection,
  newIdentity,
  projectSelection,
  type CatalogModel,
  type WorkingSelection,
} from "../app/components/catalog-prototypes/selection";
const fragment = Schema.decodeSync(CatalogFragment)({
  targets: [
    {
      kind: "package",
      title: "Package",
      description: "Package",
      contributions: [],
    },
  ],
  modules: [
    {
      id: "feature",
      title: "Feature",
      description: "Feature",
      supportedOn: [{ _tag: "kind", kind: "package" }],
      dependencies: [],
      contributions: [],
    },
  ],
});
const model: CatalogModel = { ...fragment, source: () => "official" };
const owners = ["one", "two", "three", "four", "five", "six", "seven"].map(
  (name) => newIdentity("package", name),
);
const initial: WorkingSelection = { ...emptySelection, targets: owners };
const initialProjection = projectSelection(model, initial);
const initialLayout = prototypeLayout(
  model,
  initial,
  initialProjection,
  "bands",
);

test("targets stay in a spacious horizontal row, including the seventh target", () => {
  const targets = initialLayout.nodes.filter(
    (node) => node.status === "target",
  );
  expect(new Set(targets.map((node) => node.y)).size).toBe(1);
  expect(
    targets.slice(1).every((node, i) => node.x - targets[i]!.x >= 1500),
  ).toBe(true);
});
test("promotion and demotion preserve position, velocity, and visual identity", () => {
  const world = createOrganicWorld(initialLayout, model, initialProjection);
  world.simulations.forEach((simulation) => simulation.tick(180));
  const original = world.bodies.get("catalog:feature")!;
  const working = addPick(model, initial, "feature", "package", owners[0]);
  const projection = projectSelection(model, working);
  const layout = prototypeLayout(model, working, projection, "bands");
  const selectedId = `${owners[0]!.toKey()}#feature`;
  const intermediate = continuingNodes(layout, world.bodies).find(
    (node) => node.id === selectedId,
  )!;
  expect(intermediate.x + intermediate.width / 2).toBe(original.x);
  expect(intermediate.visualId).toBe(original.visualId);
  const promoted = createOrganicWorld(
    layout,
    model,
    projection,
    world.bodies,
    1000,
  );
  const selected = promoted.bodies.get(selectedId)!;
  expect([
    selected.x,
    selected.y,
    selected.vx,
    selected.vy,
    selected.visualId,
  ]).toEqual([
    original.x,
    original.y,
    original.vx,
    original.vy,
    original.visualId,
  ]);
  promoted.selectionSimulation.tick(20);
  expect(selected.y).toBeLessThan(original.y);
  const demoted = createOrganicWorld(
    initialLayout,
    model,
    initialProjection,
    promoted.bodies,
  );
  expect(demoted.bodies.get("catalog:feature")!.visualId).toBe(
    selected.visualId,
  );
  expect(demoted.bodies.get("catalog:feature")!.y).toBe(selected.y);
  [world, promoted, demoted].forEach((current) =>
    current.simulations.forEach((simulation) => simulation.stop()),
  );
});
test("adding the same module to another target keeps two distinct visual identities", () => {
  const first = addPick(model, initial, "feature", "package", owners[0]);
  const firstProjection = projectSelection(model, first);
  const firstLayout = prototypeLayout(model, first, firstProjection, "bands");
  const world = createOrganicWorld(firstLayout, model, firstProjection);
  const second = addPick(model, first, "feature", "package", owners[1]);
  const projection = projectSelection(model, second);
  const next = createOrganicWorld(
    prototypeLayout(model, second, projection, "bands"),
    model,
    projection,
    world.bodies,
  );
  const modules = [...next.bodies.values()].filter(
    (body) => body.node?.moduleId === "feature",
  );
  expect(new Set(modules.map((body) => body.visualId)).size).toBe(2);
  [world, next].forEach((current) =>
    current.simulations.forEach((simulation) => simulation.stop()),
  );
});
