import { ChatPreparationError } from "@repo/domain/Chat";
import { UnsupportedMcpContentError } from "@repo/domain/McpClient";
import { McpResourceUris } from "@repo/domain/McpResource";

import { Array, Config, Effect, Schema } from "effect";
import { McpClient, Prompt } from "effect/ai";

export const makeMcpResources = Effect.gen(function* () {
  const client = yield* McpClient.McpClient;
  const uris = yield* Config.schema(
    Schema.fromJsonString(McpResourceUris),
    "MCP_RESOURCE_URIS",
  );

  return Effect.fn("McpResources.prepare")(
    function* () {
      const messages = yield* Effect.forEach(uris, (uri) =>
        Effect.gen(function* () {
          const resource = yield* client.readResource({ uri });
          return yield* Effect.forEach(resource.contents, (content) =>
            "text" in content
              ? Effect.succeed(
                  Prompt.userMessage({
                    content: [
                      Prompt.textPart({
                        text: `MCP resource ${content.uri}\n${content.text}`,
                      }),
                    ],
                  }),
                )
              : Effect.fail(
                  new UnsupportedMcpContentError({
                    capability: "resource",
                    source: content.uri,
                    contentType: content.mimeType ?? "binary",
                    message: `MCP resource ${content.uri} contains non-text content`,
                  }),
                ),
          );
        }),
      );
      return { messages: Array.flatten(messages) };
    },
    Effect.mapError(
      (error) =>
        new ChatPreparationError({
          reason: {
            code: Schema.is(UnsupportedMcpContentError)(error)
              ? "unsupported-content"
              : "remote-failure",
            message: error.message,
            source: "mcp-resource",
          },
        }),
    ),
  );
});
