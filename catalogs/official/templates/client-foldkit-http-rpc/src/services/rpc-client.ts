import { EventRpc } from "@repo/domain/Rpc";
import { Context, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  RpcClient as EffectRpcClient,
  RpcClientError,
  RpcSerialization,
} from "effect/unstable/rpc";

const SERVER_URL = "http://localhost:9000";

type EventRpcClient = EffectRpcClient.FromGroup<
  typeof EventRpc,
  RpcClientError.RpcClientError
>;

export class RpcClient extends Context.Service<RpcClient, EventRpcClient>()(
  "RpcClient",
) {}

export const RpcProtocolLive = EffectRpcClient.layerProtocolHttp({
  url: `${SERVER_URL}/rpc`,
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerNdjson),
);

export const RpcClientLive = Layer.effect(
  RpcClient,
  EffectRpcClient.make(EventRpc),
).pipe(Layer.provide(RpcProtocolLive));
