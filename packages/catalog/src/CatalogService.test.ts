import { assert, layer } from "@effect/vitest";
import { ModuleId } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { CatalogService } from "./CatalogService";

layer(CatalogService.layer)("CatalogService", (it) => {
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
