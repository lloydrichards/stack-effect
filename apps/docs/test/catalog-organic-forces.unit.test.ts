import { CatalogFragment } from "@repo/domain/Catalog";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { prototypeLayout } from "../app/components/catalog-prototypes/layout";
import { createOrganicWorld } from "../app/components/catalog-prototypes/organic-forces";
import {
  emptySelection,
  addPick,
  newIdentity,
  projectSelection,
  type CatalogModel,
} from "../app/components/catalog-prototypes/selection";

const fragment = Schema.decodeUnknownSync(CatalogFragment)({
  targets: ["client", "server"].map((kind) => ({
    kind,
    title: kind,
    description: kind,
    contributions: [],
  })),
  modules: Array.from({ length: 10 }, (_, i) => ({
    id: `module-${i}`,
    title: `Module ${i}`,
    description: "A module",
    supportedOn: [{ _tag: "kind", kind: i < 5 ? "client" : "server" }],
    dependencies:
      i === 0
        ? [
            {
              _tag: "required-module",
              target: { kind: "client", name: "web" },
              moduleId: "module-1",
            },
          ]
        : [],
    contributions: [],
  })),
});
const model: CatalogModel = { ...fragment, source: () => "official" };
const projection = projectSelection(model, emptySelection);
const layout = prototypeLayout(model, emptySelection, projection, "bands");
const makeWorld = () => {
  const world = createOrganicWorld(layout, model, projection);
  world.catalogSimulation.tick(160);
  return world;
};

test("dragging a module changes neighboring positions through the live forces", () => {
  const control = makeWorld();
  const dragged = makeWorld();
  const moved = dragged.bodies.get("catalog:module-0")!;
  moved.fx = moved.x + 240;
  moved.fy = moved.y + 80;
  control.catalogSimulation.alpha(0.6).tick(65);
  dragged.catalogSimulation.alpha(0.6).tick(65);
  const neighbors = [...dragged.bodies.values()].filter(
    (body) =>
      body.kind === "client" &&
      body.id !== moved.id &&
      body.status === "catalog",
  );
  expect(
    neighbors.some((body) => {
      const original = control.bodies.get(body.id)!;
      return Math.hypot(body.x - original.x, body.y - original.y) > 8;
    }),
  ).toBe(true);
  expect(
    dragged
      .snapshot()
      .nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
  ).toBe(true);
  expect(projection.modules).toHaveLength(0);
  control.catalogSimulation.stop();
  dragged.catalogSimulation.stop();
});

test("module islands have no target hubs and link across target kinds by real dependencies", () => {
  const relatedModel: CatalogModel = {
    ...model,
    modules: model.modules.map((module, i) =>
      i === 0
        ? {
            ...module,
            dependencies: [
              {
                _tag: "required-module" as const,
                target: newIdentity("server", "api"),
                moduleId: model.modules[5]!.id,
              },
            ],
          }
        : module,
    ),
  };
  const projected = projectSelection(relatedModel, emptySelection);
  const relatedLayout = prototypeLayout(
    relatedModel,
    emptySelection,
    projected,
    "bands",
  );
  const world = createOrganicWorld(relatedLayout, relatedModel, projected);
  expect(relatedLayout.groups).toEqual([]);
  expect(
    [...world.bodies.values()].every((body) => body.status === "catalog"),
  ).toBe(true);
  expect(world.bonds).toContainEqual({
    from: "catalog:module-0",
    to: "catalog:module-5",
    type: "dependency",
  });
  expect(world.bonds.every((bond) => bond.type !== "support")).toBe(true);
  world.simulations.forEach((simulation) => simulation.stop());
});

test("force snapshots preserve node identity, source provenance, and the declarative layout", () => {
  const before = layout.nodes.map((node) => ({ ...node }));
  const world = makeWorld();
  expect(world.snapshot().nodes.map((n) => n.id)).toEqual(
    layout.nodes.map((n) => n.id),
  );
  expect(world.snapshot().nodes.every((n) => n.source === "official")).toBe(
    true,
  );
  expect(layout.nodes).toEqual(before);
  const boxes = world.snapshot().nodes;
  expect(
    boxes.every((a, i) =>
      boxes
        .slice(i + 1)
        .every(
          (b) =>
            !(
              a.x < b.x + b.width &&
              a.x + a.width > b.x &&
              a.y < b.y + b.height &&
              a.y + a.height > b.y
            ),
        ),
    ),
  ).toBe(true);
  world.catalogSimulation.stop();
});

test("the selection and catalog have independent bodies and forces, with visual bridges only", () => {
  const working = addPick(
    model,
    { ...emptySelection, targets: [newIdentity("client", "web")] },
    "module-0",
  );
  const selected = projectSelection(model, working);
  const selectedLayout = prototypeLayout(model, working, selected, "bands");
  const world = createOrganicWorld(selectedLayout, model, selected);
  world.simulations.forEach((simulation) => simulation.tick(120));
  const before = world
    .snapshot()
    .nodes.filter((n) => n.status === "catalog")
    .map((n) => [n.id, n.x, n.y]);
  const root = [...world.bodies.values()].find(
    (body) => body.status === "explicit",
  )!;
  root.fx = root.x + 500;
  root.fy = root.y + 150;
  world.selectionSimulation.alpha(0.8).tick(100);
  expect(
    world
      .snapshot()
      .nodes.filter((n) => n.status === "catalog")
      .map((n) => [n.id, n.x, n.y]),
  ).toEqual(before);
  expect(world.bonds.some((bond) => bond.type === "bridge")).toBe(true);
  expect(
    world.catalogSimulation
      .nodes()
      .every((body) => body.status === "catalog" || body.status === "hub"),
  ).toBe(true);
  expect(
    world.selectionSimulation
      .nodes()
      .every((body) => body.status !== "catalog" && body.status !== "hub"),
  ).toBe(true);
  world.simulations.forEach((simulation) => simulation.stop());
});
