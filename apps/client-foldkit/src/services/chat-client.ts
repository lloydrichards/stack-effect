import { ChatRpc } from "@repo/domain/ChatRpc";
import { Context, Layer } from "effect";
import {
  RpcClient as EffectRpcClient,
  RpcClientError,
} from "effect/unstable/rpc";
import { RpcProtocolLive } from "./rpc-client";

type ChatRpcClient = EffectRpcClient.FromGroup<
  typeof ChatRpc,
  RpcClientError.RpcClientError
>;

export class ChatClient extends Context.Service<ChatClient, ChatRpcClient>()(
  "ChatClient",
) {}

export const ChatClientLive = Layer.effect(
  ChatClient,
  EffectRpcClient.make(ChatRpc),
).pipe(Layer.provide(RpcProtocolLive));
