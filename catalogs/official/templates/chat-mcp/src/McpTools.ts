import { ChatPreparationError } from "@repo/domain/Chat";

import { Effect } from "effect";
import { McpClient } from "effect/ai";

export const makeMcpTools = Effect.gen(function* () {
  const client = yield* McpClient.McpClient;
  return Effect.fn("McpTools.prepare")(
    function* () {
      const toolkit = yield* McpClient.toolkit(client, "mcp__");
      return { toolkit };
    },
    Effect.mapError(
      (error) =>
        new ChatPreparationError({
          reason: {
            code: "remote-failure",
            message: error.message,
            source: "mcp-tools",
          },
        }),
    ),
  );
});
