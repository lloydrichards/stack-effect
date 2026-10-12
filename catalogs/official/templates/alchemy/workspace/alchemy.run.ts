import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer } from "effect";

// Import target declarations and compose your resources here.
const Applications = Effect.all({});

export default Alchemy.Stack(
  "{{projectName}}",
  {
    providers: Cloudflare.providers(),
    state: Layer.unwrap(
      Effect.gen(function* () {
        const { dev } = yield* Alchemy.AlchemyContext;
        return dev ? Alchemy.localState() : Cloudflare.state();
      }),
    ),
  },
  Applications,
);
