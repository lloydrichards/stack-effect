import { EventRpc } from "@repo/domain/Rpc";
import { Context, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import {
  RpcClient as EffectRpcClient,
  RpcClientError,
  RpcSerialization,
} from "effect/rpc";

const SERVER_URL =
  import.meta.env["VITE_SERVER_URL"] || "http://localhost:9000";

type EventRpcClient = EffectRpcClient.FromGroup<
  typeof EventRpc,
  RpcClientError.RpcClientError
>;

export class RpcClient extends Context.Service<RpcClient, EventRpcClient>()(
  "RpcClient",
) {}

export const rpcProtocol = (path: string) =>
  EffectRpcClient.layerProtocolHttp({
    url: `${SERVER_URL}${path}`,
  }).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(RpcSerialization.layerNdjson),
  );

export const RpcProtocolLayer = rpcProtocol("/rpc");

export const RpcClientLayer = Layer.effect(
  RpcClient,
  EffectRpcClient.make(EventRpc),
).pipe(Layer.provide(RpcProtocolLayer));
