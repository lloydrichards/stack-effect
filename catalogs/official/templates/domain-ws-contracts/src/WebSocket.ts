import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const ClientId = Schema.String.pipe(Schema.brand("ClientId"));
export type ClientId = typeof ClientId.Type;

export const ClientStatus = Schema.Literals(["online", "away", "busy"]);
export type ClientStatus = typeof ClientStatus.Type;

export const ClientInfo = Schema.Struct({
  clientId: ClientId,
  status: ClientStatus,
  connectedAt: Schema.DateTimeUtcFromMillis,
});
export type ClientInfo = typeof ClientInfo.Type;

export const WebSocketEvent = Schema.TaggedUnion({
  // Sent only to the subscriber, with the ClientId it was assigned.
  connected: {
    clientId: ClientId,
    connectedAt: Schema.DateTimeUtcFromMillis,
  },
  user_joined: {
    client: ClientInfo,
  },
  status_changed: {
    clientId: ClientId,
    status: ClientStatus,
    changedAt: Schema.DateTimeUtcFromMillis,
  },
  user_left: {
    clientId: ClientId,
    disconnectedAt: Schema.DateTimeUtcFromMillis,
  },
});
export type WebSocketEvent = typeof WebSocketEvent.Type;

export class WebSocketRpc extends RpcGroup.make(
  Rpc.make("subscribe", {
    success: WebSocketEvent,
    stream: true,
  }),

  // Takes the ClientId that subscribe assigned.
  Rpc.make("setStatus", {
    payload: {
      clientId: ClientId,
      status: ClientStatus,
    },
  }),

  Rpc.make("getPresence", {
    success: Schema.Struct({
      clients: Schema.Array(ClientInfo),
    }),
  }),
) {}
