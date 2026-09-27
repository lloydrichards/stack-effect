/// <reference lib="webworker" />

import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import { CatalogService } from "@repo/catalog";
import { ModuleCategory } from "@repo/domain/Catalog";
import {
  CatalogLoader,
  RecipePreviewService,
  toWorkspaceToolValue,
} from "@repo/scaffold/browser";
import type { CatalogLoadFailure, LoadedCatalog } from "@repo/scaffold/browser";
import { Data, Effect, Layer, SynchronizedRef } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { RpcServer } from "effect/unstable/rpc";
import { makeRecipeBuilderRpcFailure, RecipeBuilderRpc } from "./domain";
import { IndexedDbCatalogCache } from "./IndexedDbCatalogCache";

type CatalogSession = {
  readonly id: number;
  readonly sourceUrl: string;
  readonly load: Effect.Effect<LoadedCatalog, CatalogLoadFailure>;
};

class CatalogSessionReplaced extends Data.TaggedError(
  "CatalogSessionReplaced",
)<{
  readonly message: string;
}> {}

const replaced = () =>
  new CatalogSessionReplaced({
    message: "This catalog session was replaced. Retry the catalog request.",
  });

const RecipeBuilderRpcHandlersLive = RecipeBuilderRpc.toLayer(
  Effect.gen(function* () {
    const loader = yield* CatalogLoader;
    const sessions = yield* SynchronizedRef.make<CatalogSession | undefined>(
      undefined,
    );

    const sessionFor = (id: number, sourceUrl: string) =>
      SynchronizedRef.modifyEffect(sessions, (current) =>
        current?.id === id && current.sourceUrl === sourceUrl
          ? Effect.succeed([current, current] as const)
          : current !== undefined && id <= current.id
            ? Effect.fail(replaced())
            : Effect.map(
                Effect.cached(
                  loader.load({ sourceUrl, allowFinalizeScripts: true }),
                ),
                (load) => {
                  const next = { id, sourceUrl, load };
                  return [next, next] as const;
                },
              ),
      );

    const currentSession = (id: number) =>
      Effect.gen(function* () {
        const session = yield* SynchronizedRef.get(sessions);
        if (session?.id !== id) return yield* replaced();
        return yield* session.load;
      });

    const configurationChoices = (
      catalogs: typeof CatalogService.Service,
      category: string,
    ) =>
      catalogs
        .getModules({ category: ModuleCategory.make(category) })
        .map((module) => ({
          ...module,
          value: toWorkspaceToolValue(module.id),
          supportedRuntimes:
            module.supportedRuntimes ?? (["bun", "node"] as const),
        }));

    return RecipeBuilderRpc.of({
      preview: Effect.fnUntraced(
        function* ({ sessionId, ...input }) {
          const { catalog } = yield* currentSession(sessionId);
          return yield* Effect.gen(function* () {
            const previews = yield* RecipePreviewService;
            return yield* previews.preview(input);
          }).pipe(
            Effect.provide(
              RecipePreviewService.layer.pipe(
                Layer.provide(Layer.succeed(CatalogService, catalog)),
              ),
            ),
          );
        },
        (effect) =>
          effect.pipe(
            Effect.mapError((error) =>
              makeRecipeBuilderRpcFailure("preview", error),
            ),
          ),
      ),
      catalog: Effect.fnUntraced(function* ({ owners, sourceUrl, sessionId }) {
        const session = yield* sessionFor(sessionId, sourceUrl).pipe(
          Effect.mapError((error) =>
            makeRecipeBuilderRpcFailure("catalog", error),
          ),
        );
        const loaded = yield* session.load.pipe(
          Effect.mapError((error) =>
            makeRecipeBuilderRpcFailure("catalog", error),
          ),
        );
        const catalogs = loaded.catalog;
        const projection = yield* catalogs
          .toBuilderCatalog(owners)
          .pipe(
            Effect.mapError((error) =>
              makeRecipeBuilderRpcFailure("catalog", error),
            ),
          );
        return {
          sourceUrl: loaded.sourceUrl,
          freshness: loaded.freshness,
          ...(loaded.warning === undefined ? {} : { warning: loaded.warning }),
          targets: projection.targets,
          targetModules: projection.targetModules,
          configuration: {
            monorepo: configurationChoices(catalogs, "monorepo"),
            lint: configurationChoices(catalogs, "lint"),
            format: configurationChoices(catalogs, "format"),
            test: configurationChoices(catalogs, "test"),
            devenv: configurationChoices(catalogs, "devenv"),
          },
        };
      }),
    });
  }),
).pipe(
  Layer.provide(
    CatalogLoader.layer.pipe(
      Layer.provide(IndexedDbCatalogCache),
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(BrowserCrypto.layer),
    ),
  ),
);

const WorkerLive = RpcServer.layer(RecipeBuilderRpc, {
  concurrency: 2,
}).pipe(
  Layer.provide(RecipeBuilderRpcHandlersLive),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
);

Effect.runFork(Layer.launch(WorkerLive));
