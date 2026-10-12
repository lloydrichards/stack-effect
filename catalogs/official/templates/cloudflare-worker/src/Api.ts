import { HealthGroup, HelloGroup } from "@repo/domain/Api";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { HttpApi, HttpApiBuilder } from "effect/http-api";

const Api = HttpApi.make("WorkerApi").add(HealthGroup).add(HelloGroup);

const HealthLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("get", () => Effect.succeed("Hello Effect!")),
);

const HelloLive = HttpApiBuilder.group(Api, "hello", (handlers) =>
  handlers.handle("get", () =>
    Effect.succeed({ message: "Hello Effect!", success: true }),
  ),
);

// These public read-only endpoints send no cookies.
export const ApiLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([HealthLive, HelloLive]),
  Layer.provide(
    HttpRouter.cors({
      allowedOrigins: ["*"],
      allowedMethods: ["GET", "OPTIONS"],
      allowedHeaders: ["Content-Type", "b3", "traceparent", "tracestate"],
    }),
  ),
);
