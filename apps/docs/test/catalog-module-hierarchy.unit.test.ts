import { CatalogFragment } from "@repo/domain/Catalog";
import { Schema } from "effect";
import { expect, test } from "vitest";
import {
  moduleAccessReason,
  targetEntryModules,
} from "../app/components/catalog-prototypes/module-hierarchy";
import {
  addPick,
  emptySelection,
  newIdentity,
  projectSelection,
  type CatalogModel,
} from "../app/components/catalog-prototypes/selection";
const fragment = Schema.decodeUnknownSync(CatalogFragment)({
  targets: [
    {
      kind: "server",
      title: "Server",
      description: "Server",
      contributions: [],
    },
  ],
  modules: [
    {
      id: "chat",
      children: [
        { moduleId: "mcp", requirement: "optional" },
        { moduleId: "support", requirement: "required" },
      ],
    },
    { id: "mcp", children: [{ moduleId: "tools", requirement: "optional" }] },
    { id: "tools" },
    { id: "support", visibility: "internal" },
  ].map((module) => ({
    title: module.id,
    description: module.id,
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [],
    contributions: [],
    ...module,
  })),
});
const model: CatalogModel = { ...fragment, source: () => "official" };
const owner = newIdentity("server", "api");
const other = newIdentity("server", "other");
const initial = { ...emptySelection, targets: [owner, other] };
const module = (id: string) => model.modules.find((entry) => entry.id === id)!;

test("only public entry modules are offered directly on a target", () => {
  expect(targetEntryModules(model, owner).map((entry) => entry.id)).toEqual([
    "chat",
  ]);
  const projected = projectSelection(model, initial);
  expect(moduleAccessReason(model, projected, module("mcp"), owner)).toContain(
    "chat",
  );
  expect(
    moduleAccessReason(model, projected, module("support"), owner),
  ).toContain("automatically");
});
test("optional features unlock one level at a time on the correct target", () => {
  const chat = addPick(model, initial, "chat", owner.kind, owner);
  const projected = projectSelection(model, chat);
  expect(
    moduleAccessReason(model, projected, module("mcp"), owner),
  ).toBeUndefined();
  expect(
    moduleAccessReason(model, projected, module("tools"), owner),
  ).toContain("mcp");
  expect(moduleAccessReason(model, projected, module("mcp"), other)).toContain(
    "chat",
  );
  expect(
    projected.modules.find((entry) => entry.module.id === "support")?.explicit,
  ).toBe(false);
  const withMcp = addPick(model, chat, "mcp", owner.kind, owner);
  const ready = projectSelection(model, withMcp);
  expect(
    moduleAccessReason(model, ready, module("tools"), owner),
  ).toBeUndefined();
  expect(ready.links).toContainEqual({
    from: `${owner.toKey()}#chat`,
    to: `${owner.toKey()}#mcp`,
    reason: "Optional feature",
  });
  expect(
    ready.links.some(
      (link) =>
        link.from === `target:${owner.toKey()}` &&
        link.to === `${owner.toKey()}#mcp`,
    ),
  ).toBe(false);
});
