import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const TickEvent = Schema.Union([
  Schema.TaggedStruct("starting", {}),
  Schema.TaggedStruct("tick", {}),
  Schema.TaggedStruct("end", {}),
]);

export class EventRpc extends RpcGroup.make(
  Rpc.make("tick", {
    payload: {
      ticks: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    },
    success: TickEvent,
    stream: true,
  }),
) {}

export const RpcApi = EventRpc.merge();
