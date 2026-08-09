import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import { Context, Effect, Layer } from "effect";
import { RpcClient, RpcGroup } from "effect/unstable/rpc";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import * as EffectWorker from "effect/unstable/workers/Worker";
import type { WorkerError } from "effect/unstable/workers/WorkerError";
import {
  RecipeBuilderRpc,
  type RecipeBuilderRpcFailure,
} from "./recipe-preview-protocol";

type RecipeBuilderRpcClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof RecipeBuilderRpc>,
  RpcClientError
>;

export class RecipePreviewClient extends Context.Service<
  RecipePreviewClient,
  RecipeBuilderRpcClient
>()("RecipePreviewClient") {
  static readonly layer = Layer.effect(this, RpcClient.make(RecipeBuilderRpc));
}

type BrowserWorkerSpawner = (id: number) => globalThis.Worker;
type OwnedWorker = {
  readonly worker: globalThis.Worker;
  readonly onMessageError: (event: MessageEvent) => void;
};

export const layerOwnedWorkerSpawner = (
  spawn: BrowserWorkerSpawner,
): Layer.Layer<EffectWorker.Spawner> =>
  Layer.effect(
    EffectWorker.Spawner,
    Effect.gen(function* () {
      const workers = new Map<number, OwnedWorker>();
      const terminate = ({ worker, onMessageError }: OwnedWorker) => {
        worker.removeEventListener("messageerror", onMessageError);
        worker.terminate();
      };
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          for (const entry of workers.values()) terminate(entry);
          workers.clear();
        }),
      );
      return (id: number) => {
        const previous = workers.get(id);
        if (previous !== undefined) terminate(previous);
        const worker = spawn(id);
        const onMessageError = (event: MessageEvent) => {
          worker.dispatchEvent(
            Object.assign(new Event("error"), {
              error: event.data,
              message: "The worker could not deserialize a message.",
            }),
          );
        };
        worker.addEventListener("messageerror", onMessageError);
        workers.set(id, { worker, onMessageError });
        return worker;
      };
    }),
  );

const makeWorker = () =>
  new Worker(new URL("./recipe-preview.worker.ts", import.meta.url), {
    type: "module",
  });

export type RecipePreviewClientError = RecipeBuilderRpcFailure | RpcClientError;

export const recipePreviewClientErrorMessage = (
  error: RecipePreviewClientError | WorkerError,
): string =>
  error._tag === "RecipeBuilderRpcFailure"
    ? error.message
    : "The preview worker stopped unexpectedly.";

export const makeRecipePreviewClientLayer = (
  spawn: BrowserWorkerSpawner = makeWorker,
): Layer.Layer<RecipePreviewClient, WorkerError> =>
  RecipePreviewClient.layer.pipe(
    Layer.provide(RpcClient.layerProtocolWorker({ size: 1, concurrency: 2 })),
    Layer.provide(
      Layer.merge(BrowserWorker.layerPlatform, layerOwnedWorkerSpawner(spawn)),
    ),
  );

export const RecipePreviewClientLive = makeRecipePreviewClientLayer();
