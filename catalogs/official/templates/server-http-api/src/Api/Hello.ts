import { Api, type ApiResponse } from "@repo/domain/Api";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

export const HelloHandlers = HttpApiBuilder.group(Api, "hello", (handlers) =>
  handlers.handle("get", () => {
    const data: ApiResponse = {
      message: "Hello Effect!",
      success: true,
    };
    return Effect.succeed(data);
  }),
);
