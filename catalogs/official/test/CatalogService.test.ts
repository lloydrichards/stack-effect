import { assert, it as baseIt, layer } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Effect, Graph } from "effect";
import { OfficialCatalogLayer, officialCatalogLayerWith } from "../src/service";

const extra: typeof ModuleDefinition.Type = {
  id: ModuleId.make("package-extra-example"),
  title: "Extra example",
  description: "A contributed file",
  supportedOn: [{ _tag: "kind", kind: TargetKind.make("package") }],
  dependencies: [],
  contributions: [
    {
      _tag: "file",
      path: "{{targetPath}}/extra.txt",
      contents: "from fragment\n",
    },
  ],
};

baseIt.effect(
  "should project an injected module into the builder catalog, catalog tree and graph when a fragment is added to the official catalog",
  () =>
    Effect.gen(function* () {
      const catalog = yield* CatalogService;
      const projection = yield* catalog.toBuilderCatalog([
        new TargetIdentity({ kind: TargetKind.make("package"), name: "extra" }),
      ]);
      assert.isTrue(
        projection.targetModules[0]?.modules.some(
          (module) => module.id === extra.id,
        ),
      );
      assert.isTrue(
        catalog.toCatalogTree.targets.some((target) =>
          target.modules.some((module) => module.id === extra.id),
        ),
      );
      assert.isTrue(
        [...Graph.nodes(catalog.toGraph)].some(
          ([, node]) =>
            node._tag === "module" && node.definition.id === extra.id,
        ),
      );
    }).pipe(
      Effect.provide(
        officialCatalogLayerWith([{ targets: [], modules: [extra] }]),
      ),
    ),
);

layer(OfficialCatalogLayer)("CatalogService", (it) => {
  it.effect(
    "should expose module incompatibilities when building the public catalog tree",
    () =>
      Effect.gen(function* () {
        const catalog = yield* CatalogService;
        const workspace = catalog.toCatalogTree.targets.find(
          (target) => target.kind === "workspace",
        );
        const vitePlus = workspace?.modules.find(
          (module) => module.id === "workspace-monorepo-vite-plus",
        );
        const nx = workspace?.modules.find(
          (module) => module.id === "workspace-monorepo-nx",
        );
        assert.deepStrictEqual(vitePlus?.conflictsWith, [
          ModuleId.make("workspace-monorepo-turbo"),
          ModuleId.make("workspace-monorepo-nx"),
        ]);
        assert.deepStrictEqual(nx?.conflictsWith, [
          ModuleId.make("workspace-monorepo-turbo"),
          ModuleId.make("workspace-monorepo-vite-plus"),
        ]);
      }),
  );
});
