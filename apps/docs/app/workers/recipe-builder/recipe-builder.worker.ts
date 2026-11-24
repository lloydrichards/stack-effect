/// <reference lib="webworker" />

import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import { CatalogReader } from "@repo/catalog/Catalog";
import {
  ModuleCategory,
  TargetIdentity,
  TargetKind,
  type CatalogCompositionFailure,
  type CatalogLoadFailure,
  type CatalogSources,
  formatCatalogSource,
  type LoadedCatalogSource,
} from "@repo/domain/Catalog";
import { toWorkspaceToolValue } from "@repo/domain/StackConfig";
import { RecipePreviewer } from "@repo/scaffold/Apply";
import { CatalogLoader, type LoadedCatalogSet } from "@repo/scaffold/Catalog";
import {
  Data,
  Effect,
  Fiber,
  Layer,
  Option,
  Path,
  SynchronizedRef,
} from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcServer } from "effect/rpc";
import {
  CatalogModule,
  makeRecipeBuilderRpcFailure,
  RecipeBuilderCatalog,
  RecipeBuilderRpc,
  RecipeBuilderRpcFailure,
} from "./domain";
import { IndexedDbCatalogCache } from "./IndexedDbCatalogCache";

// The browser has no host repository: each preview gets its own in-memory one.
const PreviewPlatformLive = Layer.merge(
  Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
  Path.layer,
);

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
  warning,
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
          error.reason._tag === "CatalogUnavailable" &&
          error.reason.status === undefined
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

    const workspace = new TargetIdentity({
      kind: TargetKind.make("workspace"),
      name: "root",
    });

    const configurationChoices = (
      catalogs: typeof CatalogReader.Service,
      category: string,
    ) =>
      catalogs
        .getModules({ category: ModuleCategory.make(category) })
        .filter(
          (module) =>
            category !== "preset" ||
            ((module.visibility ?? "public") === "public" &&
              module.supportedOn.some((selector) =>
                workspace.matches(selector),
              )),
        )
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
            const previews = yield* RecipePreviewer;
            return yield* previews.preview(input);
          }).pipe(
            Effect.provide(
              RecipePreviewer.layer.pipe(
                Layer.provide(Layer.succeed(CatalogReader, catalog)),
                Layer.provide(PreviewPlatformLive),
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
          .toBuilderCatalog(
            [...owners, workspace].filter(({ kind }) => knownKinds.has(kind)),
          )
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
        return RecipeBuilderCatalog.make({
          sources: loaded.sources.map(toRpcSource),
          targets: projection.targets.map((target) => ({
            ...target,
            ...sourceOf({ _tag: "target", kind: target.kind }),
          })),
          targetModules: projection.targetModules.map((entry) => ({
            ...entry,
            modules: entry.modules.map((module) =>
              CatalogModule.make({
                ...module,
                ...sourceOf({ _tag: "module", id: module.id }),
              }),
            ),
          })),
          configuration: {
            monorepo: configurationChoices(catalogs, "monorepo"),
            lint: configurationChoices(catalogs, "lint"),
            format: configurationChoices(catalogs, "format"),
            test: configurationChoices(catalogs, "test"),
            devenv: configurationChoices(catalogs, "devenv"),
            presets: configurationChoices(catalogs, "preset"),
          },
        });
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
