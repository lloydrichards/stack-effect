export const domainApiContents = `import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/unstable/httpapi";

export const ApiResponse = Schema.Struct({
  message: Schema.String,
  success: Schema.Literal(true),
});

export class HealthGroup extends HttpApiGroup.make("health")
  .add(HttpApiEndpoint.get("get", "/", { success: Schema.String }))
  .prefix("/") {}

export class HelloGroup extends HttpApiGroup.make("hello")
  .add(HttpApiEndpoint.get("get", "/", { success: ApiResponse }))
  .prefix("/hello") {}

export const Api = HttpApi.make("Api").add(HealthGroup).add(HelloGroup);
`;
export const serverHealthContents = `import { Api } from "@repo/domain/Api";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
export const HealthGroupLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("get", () => Effect.succeed("Hello Effect!")),
);
`;
export const serverHelloContents = `import { Api, type ApiResponse } from "@repo/domain/Api";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const HelloGroupLive = HttpApiBuilder.group(Api, "hello", (handlers) =>
  handlers.handle("get", () => {
    const data: typeof ApiResponse.Type = {
      message: "Hello bEvr!",
      success: true,
    };
    return Effect.succeed(data);
  }),
);
`;
