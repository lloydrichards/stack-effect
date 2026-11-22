import { ChatRpc } from "@repo/domain/ChatRpc";
import { Context, Layer } from "effect";
import {
  RpcClient as EffectRpcClient,
  RpcClientError,
} from "effect/rpc";
import { rpcProtocol } from "./rpc-client";

type ChatRpcClient = EffectRpcClient.FromGroup<
  typeof ChatRpc,
  RpcClientError.RpcClientError
>;

export class ChatClient extends Context.Service<ChatClient, ChatRpcClient>()(
  "ChatClient",
) {
  static readonly layer = Layer.effect(
    ChatClient,
    EffectRpcClient.make(ChatRpc),
  ).pipe(Layer.provide(rpcProtocol("/chat-rpc")));
}
