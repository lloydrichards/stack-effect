/// <reference lib="webworker" />

import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import { type BuilderCatalogModule, CatalogService } from "@repo/catalog";
import { ModuleCategory } from "@repo/domain/Catalog";
import { toWorkspaceToolValue } from "@repo/scaffold/browser";
import { Effect, Layer, Schema } from "effect";
import { RpcServer } from "effect/unstable/rpc";
import {
  BuilderCatalogRequestSchema,
  makeRecipeBuilderRpcFailure,
  RecipeBuilderRpc,
} from "./recipe-preview-protocol";

type FlatModule = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly visibility: "public" | "internal";
  readonly dependencies: BuilderCatalogModule["dependencies"];
  readonly implications: BuilderCatalogModule["implications"];
  readonly children: ReadonlyArray<{
    readonly requirement: "required" | "optional";
    readonly moduleId: string;
  }>;
};

const flattenModules = (
  modules: ReadonlyArray<BuilderCatalogModule>,
): ReadonlyArray<FlatModule> =>
  Array.from(
    new Map(
      modules
        .flatMap((module) => [
          {
            id: module.id,
            title: module.title,
            description: module.description,
            visibility: module.visibility,
            dependencies: module.dependencies,
            implications: module.implications,
            children: module.children.map((child) => ({
              requirement: child.requirement,
              moduleId: child.module.id,
            })),
          },
          ...flattenModules(module.children.map((child) => child.module)),
        ])
        .map((module) => [module.id, module] as const),
    ).values(),
  );

const preview = ({ input }: { readonly input: unknown }) =>
  Effect.tryPromise({
    try: () => import("@repo/scaffold/browser"),
    catch: (error) => makeRecipeBuilderRpcFailure("preview", error),
  }).pipe(
    Effect.flatMap(
      ({
        RecipePreviewInputSchema,
        RecipePreviewSchema,
        RecipePreviewService,
      }) =>
        Effect.gen(function* () {
          const decoded = yield* Schema.decodeUnknownEffect(
            RecipePreviewInputSchema,
          )(input);
          const previews = yield* RecipePreviewService;
          const output = yield* previews.preview(decoded);
          return yield* Schema.encodeUnknownEffect(RecipePreviewSchema)(output);
        }).pipe(Effect.provide(RecipePreviewService.layer)),
    ),
    Effect.mapError((error) => makeRecipeBuilderRpcFailure("preview", error)),
  );

const catalog = ({ input }: { readonly input: unknown }) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(
      BuilderCatalogRequestSchema,
    )(input);
    const catalogs = yield* CatalogService;
    const projection = yield* catalogs.toBuilderCatalog(decoded.owners);
    const configurationChoices = (category: string) =>
      catalogs
        .getModules({ category: ModuleCategory.make(category) })
        .map((module) => ({
          id: module.id,
          title: module.title,
          description: module.description,
          value: toWorkspaceToolValue(module.id),
        }));
    return {
      targets: projection.targets,
      targetModules: projection.targetModules.map((target) => ({
        owner: target.owner,
        modules: flattenModules(target.modules),
      })),
      configuration: {
        monorepo: configurationChoices("monorepo"),
        lint: configurationChoices("lint"),
        format: configurationChoices("format"),
        test: configurationChoices("test"),
        developerExperience: catalogs
          .getModules({ category: ModuleCategory.make("devenv") })
          .map((module) => ({
            id: module.id,
            title: module.title,
            description: module.description,
          })),
      },
    };
  }).pipe(
    Effect.provide(CatalogService.layer),
    Effect.mapError((error) => makeRecipeBuilderRpcFailure("catalog", error)),
  );

const WorkerLive = RpcServer.layer(RecipeBuilderRpc, {
  concurrency: 2,
}).pipe(
  Layer.provide(
    RecipeBuilderRpc.toLayer(
      RecipeBuilderRpc.of({
        preview,
        catalog,
      }),
    ),
  ),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
);

Effect.runFork(Layer.launch(WorkerLive));

export {};
