import * as Alchemy from "alchemy";
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Layer } from "effect";
{{#if module=workspace-alchemy-cafe}}
import Website from "./apps/client-foldkit-web/alchemy";
import Worker from "./apps/cloudflare-worker-api/alchemy";

const Applications = Effect.gen(function* () {
  const api = yield* Worker;
  const web = yield* Website({ VITE_SERVER_URL: api.url.as<string>() });
  return { api: api.url, web: web.url };
});
{{/if}}{{#if noModule=workspace-alchemy-cafe}}
// Import target declarations and compose your resources here.
const Applications = Effect.all({});
{{/if}}
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
