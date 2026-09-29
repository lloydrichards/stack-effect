import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import type { TargetIdentity } from "@repo/domain/Catalog";
import type { CatalogSources } from "@repo/domain/CatalogSource";
import { RecipePreviewInput } from "@repo/scaffold/recipe-preview";
import { Cause, Effect, Layer, Option } from "effect";
import { AtomRpc } from "effect/unstable/reactivity";
import { RpcClient } from "effect/unstable/rpc";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import {
  RecipeBuilderRpc,
  type RecipeBuilderRpcFailure,
} from "../workers/recipe-builder/domain";

class RecipeBuilderClient extends AtomRpc.Service<RecipeBuilderClient>()(
  "docs/RecipeBuilderClient",
  {
    group: RecipeBuilderRpc,
    protocol: RpcClient.layerProtocolWorker({
      size: 1,
      concurrency: 2,
    }).pipe(
      Layer.provide(
        BrowserWorker.layer(
          () =>
            new Worker(
              new URL(
                "../workers/recipe-builder/recipe-builder.worker.ts",
                import.meta.url,
              ),
              {
                type: "module",
              },
            ),
        ),
      ),
    ),
  },
) {}

export type CatalogAtomRequest = {
  readonly sessionId: number;
  readonly sources: CatalogSources;
  readonly officialUrl: string;
  readonly targetIdentityKey: string;
  readonly targets: ReadonlyArray<{
    readonly id: string;
    readonly owner: TargetIdentity;
  }>;
};

export type PreviewAtomRequest = {
  readonly sessionId: number;
  readonly targetIdentityKey: string;
  readonly input: RecipePreviewInput;
};

export const catalogAtom = RecipeBuilderClient.runtime.fn(
  Effect.fnUntraced(function* (request: CatalogAtomRequest) {
    const client = yield* RecipeBuilderClient;
    const catalog = yield* client("catalog", {
      owners: request.targets.map(({ owner }) => owner),
      sources: request.sources,
      officialUrl: request.officialUrl,
      sessionId: request.sessionId,
    });
    return { request, catalog } as const;
  }),
);

export const previewAtom = RecipeBuilderClient.runtime.fn(
  Effect.fnUntraced(function* (request: PreviewAtomRequest) {
    yield* Effect.sleep("200 millis");
    const client = yield* RecipeBuilderClient;
    const preview = yield* client("preview", {
      ...request.input,
      sessionId: request.sessionId,
    });
    return { request, preview } as const;
  }),
);

/** The worker's typed failure, when the cause carries one. */
export const recipeBuilderRpcFailure = (
  cause: Cause.Cause<RecipeBuilderRpcFailure | RpcClientError>,
): RecipeBuilderRpcFailure | undefined =>
  Cause.findErrorOption(cause).pipe(
    Option.filter((error) => error._tag === "RecipeBuilderRpcFailure"),
    Option.getOrUndefined,
  );

export const recipeBuilderRpcErrorMessage = (
  cause: Cause.Cause<RecipeBuilderRpcFailure | RpcClientError>,
): string =>
  Cause.findErrorOption(cause).pipe(
    Option.match({
      onNone: () => "The preview worker stopped unexpectedly.",
      onSome: (error) =>
        error._tag === "RecipeBuilderRpcFailure"
          ? error.message
          : "The preview worker stopped unexpectedly.",
    }),
  );
