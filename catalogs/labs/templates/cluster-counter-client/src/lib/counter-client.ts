import { CounterId } from "@repo/domain/Counter";
import { CounterApi } from "@repo/domain/CounterApi";
import { Data, Effect } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";

class InvalidCounterId extends Data.TaggedError("InvalidCounterId") {}

export const incrementCounter = Effect.fn("CounterClient.increment")(
  function* (input: string) {
    const id = yield* CounterId.makeEffect(input).pipe(
      Effect.mapError(() => new InvalidCounterId()),
    );
    const client = yield* HttpApiClient.make(CounterApi, {
      baseUrl: import.meta.env["VITE_SERVER_URL"] || "http://localhost:9000",
    });
    return yield* client.counters.increment({ params: { id } });
  },
  Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  Effect.provide(FetchHttpClient.layer),
);

export const counterError = ({ _tag }: { readonly _tag: string }) =>
  _tag === "InvalidCounterId"
    ? "Start the ID with a letter or digit. Use only ASCII letters, digits, hyphens, and underscores."
    : "Could not increment the counter. Check the server and try again.";
