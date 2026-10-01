import { Config, Effect, Layer } from "effect";
import { DevTools } from "effect/devtools";

const DevToolsConfig = Config.all({
  enableDevTools: Config.Boolean("DEVTOOLS").pipe(Config.withDefault(false)),
  devToolsUrl: Config.String("DEVTOOLS_URL").pipe(
    Config.withDefault("ws://localhost:34437"),
  ),
});

export const DevToolsLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* DevToolsConfig;

    if (!config.enableDevTools) {
      return Layer.empty;
    }

    yield* Effect.logDebug("Enabling DevTools Layer");
    return DevTools.layer(config.devToolsUrl);
  }),
);
