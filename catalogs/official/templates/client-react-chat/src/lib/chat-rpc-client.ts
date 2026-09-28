import { ChatRpc } from "@repo/domain/ChatRpc";
import { Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  RpcClient as EffectRpcClient,
  RpcSerialization,
} from "effect/unstable/rpc";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";

const ProtocolLive = EffectRpcClient.layerProtocolHttp({
  url: `${SERVER_URL}/chat-rpc`,
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class ChatRpcClient extends Context.Service<ChatRpcClient>()("ChatRpcClient", {
  make: Effect.gen(function* () {
    return {
      client: yield* EffectRpcClient.make(ChatRpc),
    } as const;
  }),
}) {
  static layer = Layer.effect(ChatRpcClient)(ChatRpcClient.make).pipe(
    Layer.provide(ProtocolLive),
  );
}
