import { CounterId, InvalidCounterId } from "@repo/domain/Counter";
import { CounterApi } from "@repo/domain/CounterApi";
import { Config, ConfigProvider, Effect } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";

const counterBrowserConfig = Config.all({
  baseUrl: Config.String("VITE_SERVER_URL").pipe(
    Config.withDefault("http://localhost:9000"),
  ),
});

export const { baseUrl: counterBaseUrl } = Effect.runSync(
  counterBrowserConfig.pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(import.meta.env))),
  ),
);

const makeCounterClient = HttpApiClient.make(CounterApi, { baseUrl: counterBaseUrl }).pipe(
  Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  Effect.provide(FetchHttpClient.layer),
);

export const incrementCounter = Effect.fn("CounterClient.increment")(function* (
  input: string,
) {
  const id = yield* CounterId.makeEffect(input).pipe(
    Effect.mapError((cause) => new InvalidCounterId({ cause })),
  );

  const client = yield* makeCounterClient;
  return yield* client.counters.increment({ params: { id } });
});

export const counterError = ({ _tag }: { readonly _tag: string }) =>
  _tag === "InvalidCounterId"
    ? "Start the ID with a letter or digit. Use only ASCII letters, digits, hyphens, and underscores."
    : "Could not increment the counter. Check the server and try again.";
