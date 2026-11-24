import { Api } from "@repo/domain/Api";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

export const HelloHandlers = HttpApiBuilder.group(Api, "hello", (handlers) =>
  handlers.handle("get", () => Effect.succeed({ message: "Hello Effect!" })),
);
