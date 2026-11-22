import * as Cloudflare from "@alchemy.run/cloudflare";
import { Platform } from "alchemy/Http";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { ApiRoutes } from "./src/Api";

export default Cloudflare.Worker(
  "{{packageName}}",
  { main: import.meta.url },
  Effect.gen(function* () {
    return {
      fetch: yield* HttpRouter.toHttpEffect(
        ApiRoutes.pipe(Layer.provide(Platform)),
      ),
    };
  }),
);
