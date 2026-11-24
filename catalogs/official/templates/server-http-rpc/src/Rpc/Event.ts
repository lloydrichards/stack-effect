import { EventRpc, RpcApi, TickEvent } from "@repo/domain/Rpc";
import { Cause, Effect, Layer, Queue } from "effect";
import { RpcSerialization, RpcServer } from "effect/rpc";

const EventRpcHandlers = EventRpc.toLayer({
  tick: Effect.fnUntraced(function* (payload) {
    const queue = yield* Queue.unbounded<TickEvent, Cause.Done>();
    yield* Effect.forkScoped(
      Effect.gen(function* () {
        yield* Queue.offer(queue, TickEvent.cases.starting.make({}));
        yield* Effect.sleep("3 seconds");
        for (let i = 0; i < payload.ticks; i++) {
          yield* Effect.sleep("1 second");
          yield* Queue.offer(queue, TickEvent.cases.tick.make({}));
        }
        yield* Queue.offer(queue, TickEvent.cases.end.make({}));
      }).pipe(Effect.ensuring(Queue.end(queue))),
    );
    return queue;
  }),
});

const RpcHandlers = Layer.mergeAll(EventRpcHandlers);

export const EventRpcRoutes = RpcServer.layerHttp({
  group: RpcApi,
  path: "/rpc",
  protocol: "http",
}).pipe(
  Layer.provide(RpcHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
);
