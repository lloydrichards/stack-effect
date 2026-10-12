import * as Cloudflare from "alchemy/Cloudflare";
import { Platform } from "alchemy/Http";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { ApiLive } from "./src/Api";

export default Cloudflare.Worker(
  "{{packageName}}",
  { main: import.meta.url },
  Effect.gen(function* () {
    return {
      fetch: yield* HttpRouter.toHttpEffect(
        ApiLive.pipe(Layer.provide(Platform)),
      ),
    };
  }),
);
