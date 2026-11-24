import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const TickEvent = Schema.TaggedUnion({
  starting: {},
  tick: {},
  end: {},
});
export type TickEvent = typeof TickEvent.Type;

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
