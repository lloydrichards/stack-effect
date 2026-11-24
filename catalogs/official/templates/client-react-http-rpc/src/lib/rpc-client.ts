import { EventRpc } from "@repo/domain/Rpc";
import { Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import {
  RpcClient as EffectRpcClient,
  type RpcClientError,
  RpcSerialization,
} from "effect/rpc";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";

const HttpProtocolLayer = EffectRpcClient.layerProtocolHttp({
  url: `${SERVER_URL}/rpc`,
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class RpcClient extends Context.Service<
  RpcClient,
  {
    readonly client: EffectRpcClient.FromGroup<
      typeof EventRpc,
      RpcClientError.RpcClientError
    >;
  }
>()("RpcClient") {
  static readonly layer = Layer.effect(
    RpcClient,
    Effect.gen(function* () {
      return RpcClient.of({ client: yield* EffectRpcClient.make(EventRpc) });
    }),
  ).pipe(Layer.provide(HttpProtocolLayer));
}
