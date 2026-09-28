import { ChatManagedRpc } from "@repo/domain/ChatManagedRpc";
import { Effect, Layer } from "effect";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import {
  ChatManagedRuntime,
  ChatManagedRuntimeLive,
} from "../runtime/ChatManagedRuntime";
import { ChatRuntimeLive } from "../runtime/ChatRuntime";

const ChatManagedRpcHandlers = ChatManagedRpc.toLayer(
  Effect.gen(function* () {
    const runtime = yield* ChatManagedRuntime;
    yield* Effect.logInfo("Starting Chat Managed RPC Live Implementation");
    return ChatManagedRpc.of({
      chat_send: ({ chatId, message }) => runtime.send({ chatId, message }),
      chat_watch: ({ chatId }) => runtime.watch(chatId),
      chat_interrupt: ({ chatId }) => runtime.interrupt(chatId),
    });
  }),
);

export const ChatManagedRpcLive = RpcServer.layerHttp({
  group: ChatManagedRpc,
  path: "/chat-managed-rpc",
  protocol: "http",
}).pipe(
  Layer.provide(ChatManagedRpcHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(ChatManagedRuntimeLive),
  Layer.provide(ChatRuntimeLive),
);
