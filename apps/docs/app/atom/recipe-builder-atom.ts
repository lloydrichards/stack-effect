import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import type { TargetIdentity } from "@repo/domain/Catalog";
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
  readonly architecture?: typeof import("@repo/domain/Catalog").ArchitectureId.Type;
  readonly targetIdentityKey: string;
  readonly targets: ReadonlyArray<{
    readonly id: string;
    readonly owner: TargetIdentity;
  }>;
};

export type PreviewAtomRequest = {
  readonly targetIdentityKey: string;
  readonly input: RecipePreviewInput;
};

export const catalogAtom = RecipeBuilderClient.runtime.fn(
  Effect.fnUntraced(function* (request: CatalogAtomRequest) {
    const client = yield* RecipeBuilderClient;
    const catalog = yield* client("catalog", {
      owners: request.targets.map(({ owner }) => owner),
      ...(request.architecture === undefined
        ? {}
        : { architecture: request.architecture }),
    });
    return { request, catalog } as const;
  }),
);

export const previewAtom = RecipeBuilderClient.runtime.fn(
  Effect.fnUntraced(function* (request: PreviewAtomRequest) {
    yield* Effect.sleep("200 millis");
    const client = yield* RecipeBuilderClient;
    const preview = yield* client("preview", request.input);
    return { request, preview } as const;
  }),
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
