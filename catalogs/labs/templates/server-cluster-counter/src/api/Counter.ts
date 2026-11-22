import { CounterApi, CounterUnavailable } from "@repo/domain/CounterApi";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { CounterEntity } from "../cluster/Counter";

const CounterGroupLive = HttpApiBuilder.group(
  CounterApi,
  "counters",
  (handlers) =>
    Effect.gen(function* () {
      const counter = yield* CounterEntity.client;
      return handlers.handle("increment", ({ params: { id } }) =>
        counter(id)
          .Increment()
          .pipe(
            Effect.map((count) => ({ id, count })),
            Effect.tapError(Effect.logError),
            Effect.mapError(() => new CounterUnavailable()),
          ),
      );
    }),
);

export const CounterApiLive = HttpApiBuilder.layer(CounterApi).pipe(
  Layer.provide(CounterGroupLive),
);
