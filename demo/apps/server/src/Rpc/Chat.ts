import { ChatService, ChatServiceLive, FastModelLive } from "@repo/ai";
import { ChatRpc } from "@repo/domain/ChatRpc";
import { Effect, Layer } from "effect";
import { Prompt } from "effect/unstable/ai";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

const ChatRpcHandlers = ChatRpc.toLayer(
  Effect.gen(function* () {
    const bot = yield* ChatService;
    yield* Effect.logInfo("Starting Chat RPC Live Implementation");
    return ChatRpc.of({
      chat_ask: ({ messages }) =>
        bot.chat(
          messages.map((msg) => {
            if (msg.role === "system") {
              return Prompt.makeMessage(msg.role, {
                content: msg.content,
              });
            }
            return Prompt.makeMessage(msg.role, {
              content: [Prompt.makePart("text", { text: msg.content })],
            });
          }),
        ),
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
  Layer.provide([ChatServiceLive, FastModelLive]),
);
