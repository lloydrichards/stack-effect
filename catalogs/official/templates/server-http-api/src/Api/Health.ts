import { Api } from "@repo/domain/Api";
import { Effect, type Layer } from "effect";
import { HttpApiBuilder, type HttpApiGroup } from "effect/http-api";
export const HealthGroupLive: Layer.Layer<
  HttpApiGroup.Service<"Api", "health">
> = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("get", () => Effect.succeed("Hello Effect!")),
);
