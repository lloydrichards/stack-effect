// Domain RPC schema (tick only — chat is separate module)
export const domainRpcContents = `import { Schema } from "effect";
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
`;

// Server tick handler
export const serverTickContents = `import { EventRpc, type TickEvent } from "@repo/domain/Rpc";
import { Effect, Queue } from "effect";

export const EventRpcLive = EventRpc.toLayer(
  Effect.gen(function* () {
    yield* Effect.logInfo("Starting Event RPC Live Implementation");
    return EventRpc.of({
      tick: Effect.fn(function* (payload) {
        yield* Effect.logDebug("Creating new tick stream");
        const queue = yield* Queue.unbounded<typeof TickEvent.Type>();
        yield* Effect.forkScoped(
          Effect.gen(function* () {
            yield* Queue.offer(queue, { _tag: "starting" });
            yield* Effect.sleep("3 seconds");
            for (let i = 0; i < payload.ticks; i++) {
              yield* Effect.sleep("1 second");
              yield* Queue.offer(queue, { _tag: "tick" });
            }
            yield* Queue.offer(queue, { _tag: "end" });
            yield* Effect.logDebug("End event sent");
          }).pipe(Effect.ensuring(Queue.shutdown(queue))),
        );
        return queue;
      }),
    });
  }),
);
`;
