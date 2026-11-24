import { ChatRpc } from "@repo/domain/ChatRpc";
import { Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import {
  RpcClient as EffectRpcClient,
  type RpcClientError,
  RpcSerialization,
} from "effect/rpc";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";

const HttpProtocolLayer = EffectRpcClient.layerProtocolHttp({
  url: `${SERVER_URL}/chat-rpc`,
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class ChatRpcClient extends Context.Service<
  ChatRpcClient,
  {
    readonly client: EffectRpcClient.FromGroup<
      typeof ChatRpc,
      RpcClientError.RpcClientError
    >;
  }
>()("ChatRpcClient") {
  static readonly layer = Layer.effect(
    ChatRpcClient,
    Effect.gen(function* () {
      return ChatRpcClient.of({ client: yield* EffectRpcClient.make(ChatRpc) });
    }),
  ).pipe(Layer.provide(HttpProtocolLayer));
}
