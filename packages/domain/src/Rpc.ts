import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

// Define Event RPC

export const TickEvent = Schema.Union([
  Schema.TaggedStruct("starting", {}),
  Schema.TaggedStruct("tick", {}),
  Schema.TaggedStruct("end", {}),
]);

export class EventRpc extends RpcGroup.make(
  Rpc.make("tick", {
    payload: {
      ticks: Schema.Number,
    },
    success: TickEvent,
    stream: true,
  }),
) {}
