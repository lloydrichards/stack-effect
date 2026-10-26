import { Config, Effect, Layer, Option, Redacted } from "effect";
import { McpClient, McpProtocol } from "effect/ai";
import { FetchHttpClient } from "effect/http";

export const McpClientLive = Layer.unwrap(
  Effect.gen(function* () {
    const url = yield* Config.URL("MCP_SERVER_URL");
    const protocolVersion = yield* Config.Literals(
      ["2025-11-25", "2026-07-28"],
      "MCP_PROTOCOL_VERSION",
    ).pipe(Config.withDefault("2026-07-28"));
    const token = yield* Config.option(Config.Redacted("MCP_AUTH_TOKEN"));

    return McpClient.layerHttp({
      name: "{{packageName}}",
      version: "0.0.0",
      url,
      protocol:
        protocolVersion === "2025-11-25"
          ? McpProtocol.v2025_11_25
          : McpProtocol.v2026_07_28,
      headers: Option.match(token, {
        onNone: () => undefined,
        onSome: (token) => ({
          authorization: `Bearer ${Redacted.value(token)}`,
        }),
      }),
    });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
