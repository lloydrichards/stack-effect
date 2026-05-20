import { BrowserSocket } from "@effect/platform-browser";
import { WebSocketRpc } from "@repo/domain/WebSocket";
import { Context, Layer } from "effect";
import {
  RpcClient as EffectRpcClient,
  RpcClientError,
  RpcSerialization,
} from "effect/unstable/rpc";

const WS_URL = "ws://localhost:9000/ws";

type WsRpcClient = EffectRpcClient.FromGroup<
  typeof WebSocketRpc,
  RpcClientError.RpcClientError
>;

export class WsClient extends Context.Service<WsClient, WsRpcClient>()(
  "WsClient",
) {}

const WsProtocolLive = EffectRpcClient.layerProtocolSocket({
  retryTransientErrors: true,
}).pipe(
  Layer.provide(BrowserSocket.layerWebSocket(WS_URL)),
  Layer.provide(RpcSerialization.layerNdjson),
);

export const WsClientLive = Layer.effect(
  WsClient,
  EffectRpcClient.make(WebSocketRpc),
).pipe(Layer.provide(WsProtocolLive));
