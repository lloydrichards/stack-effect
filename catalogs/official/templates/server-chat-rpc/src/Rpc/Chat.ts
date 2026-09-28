import { ChatRpc } from "@repo/domain/ChatRpc";
import { Effect, Layer } from "effect";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { ChatRuntime, ChatRuntimeLive } from "../runtime/ChatRuntime";

const ChatRpcHandlers = ChatRpc.toLayer(
  Effect.gen(function* () {
    const runtime = yield* ChatRuntime;
    yield* Effect.logInfo("Starting Chat RPC Live Implementation");
    return ChatRpc.of({
      chat_start: () => runtime.start,
      chat_ask: ({ chatId, messages }) => runtime.ask(chatId, messages),
    });
  }),
);

export const ChatRpcLive = RpcServer.layerHttp({
  group: ChatRpc,
  path: "/chat-rpc",
  protocol: "http",
}).pipe(
  Layer.provide(ChatRpcHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(ChatRuntimeLive),
);
