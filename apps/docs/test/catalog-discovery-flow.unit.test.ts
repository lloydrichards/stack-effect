import { CatalogFragment } from "@repo/domain/Catalog";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { prototypeLayout } from "../app/components/catalog-prototypes/layout";
import { createOrganicWorld } from "../app/components/catalog-prototypes/organic-forces";
import {
  addPick,
  emptySelection,
  newIdentity,
  projectSelection,
  type CatalogModel,
  type WorkingSelection,
} from "../app/components/catalog-prototypes/selection";

const fragment = Schema.decodeUnknownSync(CatalogFragment)({
  targets: ["server", "client"].map((kind) => ({
    kind,
    title: kind,
    description: kind,
    contributions: [],
  })),
  modules: [
    { id: "chat", children: [{ moduleId: "mcp", requirement: "optional" }] },
    { id: "mcp", children: [{ moduleId: "tools", requirement: "optional" }] },
    { id: "tools" },
    { id: "http" },
    { id: "other", kind: "client" },
  ].map(({ kind, ...module }) => ({
    title: module.id,
    description: module.id,
    supportedOn: [{ _tag: "kind", kind: kind ?? "server" }],
    dependencies: [],
    contributions: [],
    ...module,
  })),
});
const model: CatalogModel = { ...fragment, source: () => "official" };
const owner = newIdentity("server", "api");
const initial: WorkingSelection = { ...emptySelection, targets: [owner] };
const worldFor = (working: WorkingSelection) => {
  const projection = projectSelection(model, working);
  const layout = prototypeLayout(model, working, projection, "bands");
  const world = createOrganicWorld(layout, model, projection);
  world.simulations.forEach((simulation) => simulation.tick(240));
  return world;
};

test("available entry modules settle above locked features and unrelated modules", () => {
  const world = worldFor(initial);
  const chat = world.bodies.get("catalog:chat")!;
  const mcp = world.bodies.get("catalog:mcp")!;
  const other = world.bodies.get("catalog:other")!;
  expect(chat.discovery?.tier).toBe("available");
  expect(mcp.discovery?.tier).toBe("related");
  expect(other.discovery?.tier).toBe("distant");
  expect(chat.y + 300).toBeLessThan(mcp.y);
  expect(chat.y + 1000).toBeLessThan(other.y);
  expect(world.bodies.get(`target:${owner.toKey()}`)!.y + 200).toBeLessThan(
    chat.y,
  );
  world.simulations.forEach((simulation) => simulation.stop());
});

test("adding parents promotes newly unlocked features, and removing them restores distance", () => {
  const chat = addPick(model, initial, "chat", owner.kind, owner);
  const withChat = worldFor(chat);
  expect(withChat.bodies.get("catalog:mcp")!.discovery?.tier).toBe("next");
  expect(withChat.bodies.get("catalog:tools")!.discovery?.tier).toBe("related");
  expect(withChat.bodies.get("catalog:mcp")!.y + 300).toBeLessThan(
    withChat.bodies.get("catalog:tools")!.y,
  );
  const withMcp = worldFor(addPick(model, chat, "mcp", owner.kind, owner));
  expect(withMcp.bodies.get("catalog:tools")!.discovery?.tier).toBe("next");
  const removed = worldFor(initial);
  expect(removed.bodies.get("catalog:tools")!.discovery?.tier).toBe("related");
  [withChat, withMcp, removed].forEach((world) =>
    world.simulations.forEach((simulation) => simulation.stop()),
  );
});

test("focusing discovery rearranges the catalog without moving selected bodies", () => {
  const world = worldFor(addPick(model, initial, "chat", owner.kind, owner));
  const positions = world.selectionSimulation
    .nodes()
    .map((body) => [body.id, body.x, body.y]);
  world.focusDiscovery(`${owner.toKey()}#chat`);
  world.catalogSimulation.tick(150);
  expect(
    world.selectionSimulation.nodes().map((body) => [body.id, body.x, body.y]),
  ).toEqual(positions);
  world.simulations.forEach((simulation) => simulation.stop());
});
