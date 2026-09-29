/// <reference lib="webworker" />

import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import { CatalogService } from "@repo/catalog";
import { ModuleCategory } from "@repo/domain/Catalog";
import {
  type CatalogSources,
  formatCatalogSource,
} from "@repo/domain/CatalogSource";
import {
  CatalogLoader,
  RecipePreviewService,
  toWorkspaceToolValue,
} from "@repo/scaffold/browser";
import type {
  CatalogCompositionFailure,
  CatalogLoadFailure,
  LoadedCatalogSet,
  LoadedCatalogSource,
} from "@repo/scaffold/browser";
import { Data, Effect, Fiber, Layer, Option, SynchronizedRef } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { RpcServer } from "effect/unstable/rpc";
import {
  makeRecipeBuilderRpcFailure,
  RecipeBuilderRpc,
  RecipeBuilderRpcFailure,
} from "./domain";
import { IndexedDbCatalogCache } from "./IndexedDbCatalogCache";

type CatalogSession = {
  readonly id: number;
  /** Selected sources and official URL; a different key needs a new session. */
  readonly key: string;
  readonly load: Effect.Effect<
    LoadedCatalogSet,
    CatalogLoadFailure | CatalogCompositionFailure
  >;
};

const sessionKey = (sources: CatalogSources, officialUrl: string) =>
  JSON.stringify([officialUrl, ...sources.map(formatCatalogSource)]);

const toRpcSource = ({
  name,
  sourceUrl,
  requires,
  freshness,
  warning,
}: LoadedCatalogSource) => ({
  name,
  sourceUrl,
  requires,
  freshness,
  ...(warning === undefined ? {} : { warning }),
});

// A browser fetch that fails may be a CORS refusal or a transport failure;
// the page cannot tell which, so the message names neither as the cause.
const unreachableHint =
  " The browser could not fetch it. The host may be offline, or it may not allow requests from this site.";

const catalogFailure = (
  error:
    | CatalogLoadFailure
    | CatalogCompositionFailure
    | CatalogSessionReplaced,
) =>
  error._tag === "CatalogLoadFailure"
    ? new RecipeBuilderRpcFailure({
        // loadSources already prefixes the source name; its messages name the URL.
        message: `${error.message}${
          error.reason === "unavailable" && error.status === undefined
            ? unreachableHint
            : ""
        }`,
        failedSource: {
          name: error.sourceName ?? error.sourceUrl,
          sourceUrl: error.sourceUrl,
        },
      })
    : error._tag === "CatalogCompositionFailure"
      ? new RecipeBuilderRpcFailure({
          message: error.message,
          issues: error.issues.map(({ code, message }) => ({ code, message })),
          sources: error.sources.map(toRpcSource),
        })
      : makeRecipeBuilderRpcFailure("catalog", error);

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

    const sessionFor = (
      id: number,
      sources: CatalogSources,
      officialUrl: string,
    ) => {
      const key = sessionKey(sources, officialUrl);
      return SynchronizedRef.modifyEffect(sessions, (current) =>
        current?.id === id && current.key === key
          ? Effect.succeed([current, current] as const)
          : current !== undefined && id <= current.id
            ? Effect.fail(replaced())
            : Effect.map(
                // Script trust comes from source names inside the loader, never
                // from this worker, so no URL is treated as official here.
                // Detached so an interrupted request cannot cancel the session's
                // load for the callers that join it later.
                Effect.forkDetach(loader.loadSources({ sources, officialUrl })),
                (fiber) => {
                  const next = { id, key, load: Fiber.join(fiber) };
                  return [next, next] as const;
                },
              ),
      );
    };

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
      catalog: Effect.fnUntraced(function* ({
        owners,
        sources,
        officialUrl,
        sessionId,
      }) {
        const session = yield* sessionFor(sessionId, sources, officialUrl).pipe(
          Effect.mapError(catalogFailure),
        );
        const loaded = yield* session.load.pipe(
          Effect.mapError(catalogFailure),
        );
        const catalogs = loaded.catalog;
        const knownKinds = new Set<string>(catalogs.getTargetKinds());
        const projection = yield* catalogs
          // Targets from a source no longer selected have nothing to project.
          .toBuilderCatalog(owners.filter(({ kind }) => knownKinds.has(kind)))
          .pipe(
            Effect.mapError((error) =>
              makeRecipeBuilderRpcFailure("catalog", error),
            ),
          );
        const sourceOf = (subject: Parameters<typeof catalogs.getSource>[0]) =>
          Option.match(catalogs.getSource(subject), {
            onNone: () => ({}),
            onSome: (source) => ({ source }),
          });
        return {
          sources: loaded.sources.map(toRpcSource),
          targets: projection.targets.map((target) => ({
            ...target,
            ...sourceOf({ _tag: "target", kind: target.kind }),
          })),
          targetModules: projection.targetModules.map((entry) => ({
            ...entry,
            modules: entry.modules.map((module) => ({
              ...module,
              ...sourceOf({ _tag: "module", id: module.id }),
            })),
          })),
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
