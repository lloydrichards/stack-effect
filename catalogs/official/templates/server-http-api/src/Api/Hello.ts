import { Api, type ApiResponse } from "@repo/domain/Api";
import { Effect, type Layer } from "effect";
import { HttpApiBuilder, type HttpApiGroup } from "effect/http-api";

export const HelloGroupLive: Layer.Layer<HttpApiGroup.Service<"Api", "hello">> =
  HttpApiBuilder.group(Api, "hello", (handlers) =>
    handlers.handle("get", () => {
      const data: typeof ApiResponse.Type = {
        message: "Hello Effect!",
        success: true,
      };
      return Effect.succeed(data);
    }),
  );
