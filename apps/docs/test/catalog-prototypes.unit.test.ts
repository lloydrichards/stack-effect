import { it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { CatalogFragment } from "@repo/domain/Catalog";
import { defaultCatalogSources } from "@repo/domain/CatalogSource";
import { BlueprintService, RecipeService } from "@repo/scaffold/browser";
import { Effect, Schema } from "effect";
import { expect } from "vitest";
import { prototypeLayout } from "../app/components/catalog-prototypes/layout";
import {
  addPick,
  catalogModel,
  chooseProvider,
  conflictFor,
  emptySelection,
  newIdentity,
  projectSelection,
  removePick,
  resolveTargetDecision,
  suggestedTarget,
  toSelection,
  type CatalogModel,
  type WorkingSelection,
} from "../app/components/catalog-prototypes/selection";
import {
  builderUrl,
  decodeExplorerUrl,
  encodeExplorerUrl,
} from "../app/components/catalog-prototypes/selection-url";
import { toRecipePreviewInput } from "../app/components/recipe-builder/form";
import { decodeRecipeBuilderUrl } from "../app/components/recipe-builder/recipe-builder-url";

const fragment = Schema.decodeUnknownSync(CatalogFragment)({
  targets: ["app", "server", "package"].map((kind) => ({
    kind,
    title: kind,
    description: kind,
    defaultName: kind === "server" ? "api" : "web",
    contributions: [],
  })),
  modules: [
    {
      id: "a",
      dependencies: [
        {
          _tag: "required-module",
          target: { kind: "package", name: "shared" },
          moduleId: "shared",
        },
        {
          _tag: "required-capability",
          target: { kind: "package", name: "db" },
          capability: "sql",
        },
      ],
      implies: [{ targetKind: "server", moduleId: "server-feature" }],
    },
    {
      id: "b",
      dependencies: [
        {
          _tag: "required-module",
          target: { kind: "package", name: "shared" },
          moduleId: "shared",
        },
      ],
    },
    {
      id: "bad",
      dependencies: [
        {
          _tag: "required-module",
          target: { kind: "package", name: "shared" },
          moduleId: "forbidden",
        },
      ],
    },
    {
      id: "shared",
      supportedOn: [
        { _tag: "identity", identity: { kind: "package", name: "shared" } },
      ],
      dependencies: [
        {
          _tag: "required-module",
          target: { kind: "package", name: "shared" },
          moduleId: "leaf",
        },
      ],
    },
    {
      id: "leaf",
      supportedOn: [
        { _tag: "identity", identity: { kind: "package", name: "shared" } },
      ],
      conflictsWith: ["forbidden"],
    },
    {
      id: "forbidden",
      supportedOn: [
        { _tag: "identity", identity: { kind: "package", name: "shared" } },
      ],
      conflictsWith: ["leaf"],
    },
    {
      id: "sqlite",
      supportedOn: [
        { _tag: "identity", identity: { kind: "package", name: "db" } },
      ],
      provides: ["sql"],
      conflictsWith: ["postgres"],
    },
    {
      id: "postgres",
      supportedOn: [
        { _tag: "identity", identity: { kind: "package", name: "db" } },
      ],
      provides: ["sql"],
      conflictsWith: ["sqlite"],
    },
    { id: "server-feature", supportedOn: [{ _tag: "kind", kind: "server" }] },
  ].map((m) => ({
    title: m.id,
    description: m.id,
    supportedOn: [{ _tag: "kind", kind: "app" }],
    dependencies: [],
    contributions: [],
    ...m,
  })),
});
const model: CatalogModel = { ...fragment, source: () => "official" };
const initial: WorkingSelection = {
  ...emptySelection,
  targets: [
    newIdentity("app", "web"),
    newIdentity("package", "shared"),
    newIdentity("package", "db"),
    newIdentity("server", "api"),
  ],
};
const remove = (state: WorkingSelection, id: string) => {
  const node = projectSelection(model, state).modules.find(
    (m) => m.module.id === id,
  )!;
  return removePick(state, node);
};

it("shares dependency nodes, removes unused additions, and preserves explicit promotions", () => {
  const selected = addPick(model, addPick(model, initial, "a"), "b");
  const projected = projectSelection(model, selected);
  expect(
    projected.modules.filter((m) => m.module.id === "shared"),
  ).toHaveLength(1);
  expect(projected.links.filter((l) => l.to.endsWith("#shared"))).toHaveLength(
    2,
  );
  const withoutA = remove(selected, "a");
  expect(
    projectSelection(model, withoutA).modules.map((m) => m.module.id),
  ).toContain("shared");
  const promoted = addPick(model, withoutA, "shared");
  expect(
    projectSelection(model, remove(promoted, "b"))
      .modules.map((m) => m.module.id)
      .sort(),
  ).toEqual(["leaf", "shared"]);
  expect(
    projectSelection(model, remove(remove(promoted, "b"), "shared")).modules,
  ).toHaveLength(0);
});
it("keeps provider choices pending and rejects direct and transitive conflicts", () => {
  const state = addPick(model, initial, "a");
  const choice = projectSelection(model, state).decisions.find(
    (d) => d.type === "provider",
  );
  expect(choice?.type).toBe("provider");
  if (choice?.type !== "provider") return;
  const resolved = chooseProvider(state, choice, "sqlite");
  expect(projectSelection(model, resolved).decisions).toHaveLength(0);
  expect(conflictFor(model, resolved, "postgres")).toHaveLength(1);
  expect(conflictFor(model, resolved, "bad")).toHaveLength(1);
  expect(projectSelection(model, resolved).conflicts).toHaveLength(0);
});
it("requires target creation and explicit resolution of ambiguous implication targets", () => {
  const missing = addPick(model, emptySelection, "a");
  const first = projectSelection(model, missing).decisions[0];
  expect(first?.type).toBe("target");
  if (first?.type !== "target") return;
  const attached = resolveTargetDecision(
    missing,
    first,
    newIdentity("app", "web"),
  );
  expect(
    projectSelection(model, attached).decisions.some(
      (d) => d.type === "target" && d.exact?.name === "shared",
    ),
  ).toBe(true);
  const ambiguous = addPick(
    model,
    {
      ...initial,
      targets: [...initial.targets, newIdentity("server", "other")],
    },
    "a",
  );
  const decision = projectSelection(model, ambiguous).decisions.find(
    (d) => d.type === "target" && d.kind === "server",
  );
  expect(decision?.type).toBe("target");
  if (decision?.type !== "target") return;
  expect(decision.candidates).toHaveLength(2);
  expect(suggestedTarget(model, decision).name).toBe("api");
  const chosen = resolveTargetDecision(
    ambiguous,
    decision,
    newIdentity("server", "other"),
  );
  expect(
    projectSelection(model, chosen).modules.find(
      (m) => m.module.id === "server-feature",
    )?.owner.name,
  ).toBe("other");
});
it("round-trips unfinished selections and preserves semantic state across both layouts", () => {
  const state = addPick(model, emptySelection, "a");
  const restored = decodeExplorerUrl(
    encodeExplorerUrl(state, defaultCatalogSources, "bands"),
  );
  expect(restored.issue).toBeUndefined();
  expect(restored.direction).toBe("bands");
  expect(
    projectSelection(model, restored.state).decisions.map((d) => d.title),
  ).toEqual(projectSelection(model, state).decisions.map((d) => d.title));
  const projected = projectSelection(model, addPick(model, initial, "b"));
  const a = prototypeLayout(model, initial, projected, "ribbon");
  const b = prototypeLayout(model, initial, projected, "bands");
  expect(
    a.nodes
      .map((n) => [n.id, n.status])
      .sort((left, right) => left.join(":").localeCompare(right.join(":"))),
  ).toEqual(
    b.nodes
      .map((n) => [n.id, n.status])
      .sort((left, right) => left.join(":").localeCompare(right.join(":"))),
  );
  expect(
    a.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
  ).toBe(true);
});
it.effect(
  "validates the completed official selection with BlueprintService and produces a valid Builder link",
  () =>
    Effect.gen(function* () {
      const service = yield* CatalogService;
      const official = catalogModel(service);
      const state = addPick(
        official,
        {
          ...emptySelection,
          targets: [
            newIdentity("client-react", "web"),
            newIdentity("server", "api"),
            newIdentity("package", "domain"),
            newIdentity("package", "db"),
          ],
        },
        "client-react-http-api-todos",
      );
      const provider = projectSelection(official, state).decisions.find(
        (d) => d.type === "provider",
      );
      expect(provider?.type).toBe("provider");
      if (provider?.type !== "provider") return;
      const completed = chooseProvider(state, provider, "package-db-sqlite");
      const projection = projectSelection(official, completed);
      expect(projection.decisions).toHaveLength(0);
      expect(projection.conflicts).toHaveLength(0);
      const blueprints = yield* BlueprintService.make;
      const blueprint = yield* blueprints.resolve(toSelection(projection));
      expect(
        blueprint.nodes.filter((n) => n._tag === "attached-module"),
      ).toHaveLength(projection.modules.length);
      const link = builderUrl(projection, defaultCatalogSources);
      const builder = decodeRecipeBuilderUrl(
        new URL(link, "https://example.test").searchParams,
      );
      expect(builder.issue).toBeUndefined();
      const input = toRecipePreviewInput(builder.initialValues);
      const recipes = yield* RecipeService.make;
      const selection = yield* recipes.resolve(input.recipe, {
        config: input.config,
        providerStrategy: { _tag: "fail-on-ambiguous" },
      });
      const builderBlueprint = yield* blueprints.resolve(
        selection,
        input.config,
      );
      expect(
        builderBlueprint.nodes.some(
          (n) =>
            n._tag === "attached-module" &&
            n.moduleId === "client-react-http-api-todos",
        ),
      ).toBe(true);
      const encoded = encodeExplorerUrl(
        completed,
        defaultCatalogSources,
        "ribbon",
      );
      const restored = projectSelection(
        official,
        decodeExplorerUrl(encoded).state,
      );
      expect(restored.modules.map((m) => m.id).sort()).toEqual(
        projection.modules.map((m) => m.id).sort(),
      );
    }).pipe(Effect.provide(OfficialCatalogLayer)),
);

it("adds a module to the focused target when multiple compatible targets exist", () => {
  const first = newIdentity("app", "first");
  const second = newIdentity("app", "second");
  const state: WorkingSelection = {
    ...emptySelection,
    targets: [first, second],
  };
  expect(addPick(model, state, "b").picks[0]?.owner).toBeUndefined();
  const next = addPick(model, state, "b", "app", second);
  expect(next.picks[0]?.owner?.toKey()).toBe(second.toKey());
  expect(
    projectSelection(model, next).modules.some(
      (entry) =>
        entry.module.id === "b" && entry.owner.toKey() === second.toKey(),
    ),
  ).toBe(true);
});
