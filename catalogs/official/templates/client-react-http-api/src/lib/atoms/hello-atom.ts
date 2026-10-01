import { Api } from "@repo/domain/Api";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { runtime } from "../atom";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";

export const helloAtom = runtime.fn(() =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(Api, {
      baseUrl: SERVER_URL,
    });
    return yield* client.hello.get();
  }).pipe(Effect.provide(FetchHttpClient.layer)),
);
