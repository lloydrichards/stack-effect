/// <reference lib="webworker" />

import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import { type BuilderCatalogModule, CatalogService } from "@repo/catalog";
import { ModuleCategory } from "@repo/domain/Catalog";
import {
  RecipePreviewService,
  toWorkspaceToolValue,
} from "@repo/scaffold/browser";
import { Effect, Layer } from "effect";
import { RpcServer } from "effect/unstable/rpc";
import {
  CatalogModule,
  makeRecipeBuilderRpcFailure,
  RecipeBuilderRpc,
} from "./domain";

const flattenModuleWalker = (
  modules: ReadonlyArray<BuilderCatalogModule>,
): ReadonlyArray<typeof CatalogModule.Type> =>
  Array.from(
    new Map(
      modules
        .flatMap((module) => [
          {
            ...module,
            children: module.children.map((child) => ({
              requirement: child.requirement,
              moduleId: child.module.id,
            })),
          },
          ...flattenModuleWalker(module.children.map((child) => child.module)),
        ])
        .map((module) => [module.id, module] as const),
    ).values(),
  );

const RecipeBuilderRpcHandlersLive = RecipeBuilderRpc.toLayer(
  Effect.gen(function* () {
    const catalogs = yield* CatalogService;
    const previews = yield* RecipePreviewService;

    const configurationChoices = (category: string) =>
      catalogs
        .getModules({ category: ModuleCategory.make(category) })
        .map((module) => ({
          ...module,
          value: toWorkspaceToolValue(module.id),
        }));

    return RecipeBuilderRpc.of({
      preview: Effect.fnUntraced(function* (input) {
        return yield* previews
          .preview(input)
          .pipe(
            Effect.mapError((error) =>
              makeRecipeBuilderRpcFailure("preview", error),
            ),
          );
      }),
      catalog: Effect.fnUntraced(function* ({ owners }) {
        const projection = yield* catalogs
          .toBuilderCatalog(owners)
          .pipe(
            Effect.mapError((error) =>
              makeRecipeBuilderRpcFailure("catalog", error),
            ),
          );
        return {
          targets: projection.targets,
          targetModules: projection.targetModules.map((target) => ({
            owner: target.owner,
            modules: flattenModuleWalker(target.modules),
          })),
          configuration: {
            monorepo: configurationChoices("monorepo"),
            lint: configurationChoices("lint"),
            format: configurationChoices("format"),
            test: configurationChoices("test"),
            devenv: configurationChoices("devenv"),
          },
        };
      }),
    });
  }),
).pipe(
  Layer.provide(CatalogService.layer),
  Layer.provide(RecipePreviewService.layer),
);

const WorkerLive = RpcServer.layer(RecipeBuilderRpc, {
  concurrency: 2,
}).pipe(
  Layer.provide(RecipeBuilderRpcHandlersLive),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
);

Effect.runFork(Layer.launch(WorkerLive));

export {};
