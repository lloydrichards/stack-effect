import { CounterId } from "@repo/domain/Counter";
import { CounterApi } from "@repo/domain/CounterApi";
import { Config, Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";

const counterCliConfig = Config.all({
  baseUrl: Config.String("COUNTER_SERVER_URL").pipe(
    Config.withDefault("http://localhost:9000"),
  ),
});

export const counter = Command.make(
  "counter",
  { id: Argument.String("id") },
  (input) =>
    Effect.gen(function* () {
      const id = yield* CounterId.makeEffect(input.id);
      const { baseUrl } = yield* counterCliConfig;

      const client = yield* HttpApiClient.make(CounterApi, { baseUrl });
      const state = yield* client.counters.increment({ params: { id } });

      yield* Console.log(`${state.id}: ${state.count}`);
    }).pipe(Effect.provide(FetchHttpClient.layer)),
).pipe(Command.withDescription("Increment a server-side counter by ID"));
