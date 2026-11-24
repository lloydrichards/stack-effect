import { ChatMessage, ChatPreparationError } from "@repo/domain/Chat";
import { UnsupportedMcpContent } from "@repo/domain/McpClient";
import { McpResourceUris } from "@repo/domain/McpResource";

import { Array, Config, Effect, Schema } from "effect";
import { McpClient } from "effect/ai";

export const makeMcpResources = Effect.gen(function* () {
  const client = yield* McpClient.McpClient;
  const uris = yield* Config.schema(
    Schema.fromJsonString(McpResourceUris),
    "MCP_RESOURCE_URIS",
  );

  const readUri = (uri: string) =>
    client.readResource({ uri }).pipe(
      Effect.flatMap((resource) =>
        Effect.forEach(resource.contents, (content) =>
          "text" in content
            ? Effect.succeed(
                ChatMessage.make({
                  role: "user",
                  content: `MCP resource ${content.uri}\n${content.text}`,
                }),
              )
            : Effect.fail(
                new UnsupportedMcpContent({
                  capability: "resource",
                  source: content.uri,
                  contentType: content.mimeType ?? "binary",
                  message: `MCP resource ${content.uri} contains non-text content`,
                }),
              ),
        ),
      ),
    );

  return Effect.fn("McpResources.prepare")(
    function* () {
      const messages = yield* Effect.forEach(uris, readUri);
      return Array.flatten(messages);
    },
    Effect.mapError(
      (error) =>
        new ChatPreparationError({
          reason: {
            code: Schema.is(UnsupportedMcpContent)(error)
              ? "unsupported-content"
              : "remote-failure",
            message: error.message,
            source: "mcp-resource",
          },
        }),
    ),
  );
});
