import { ChatPreparationError } from "@repo/domain/Chat";

import { Effect } from "effect";
import { McpClient, type Tool, type Toolkit } from "effect/ai";

export function mergeMcpToolkit<
  Local extends Record<string, Tool.Any>,
  Remote extends Record<string, Tool.Any>,
>(
  local: Toolkit.WithHandler<Local>,
  remote: Toolkit.WithHandler<Remote>,
): Effect.Effect<
  Toolkit.WithHandler<Toolkit.MergeRecords<Local | Remote>>,
  ChatPreparationError
>;
export function mergeMcpToolkit<Tools extends Record<string, Tool.Any>>(
  local: Toolkit.WithHandler<Tools>,
  remote: Toolkit.WithHandler<Tools>,
): Effect.Effect<Toolkit.WithHandler<Tools>, ChatPreparationError> {
  const duplicate = Object.keys(remote.tools).find((name) =>
    Object.hasOwn(local.tools, name),
  );
  if (duplicate !== undefined)
    return Effect.fail(
      new ChatPreparationError({
        reason: {
          code: "tool-conflict",
          message: `Duplicate chat tool name: ${duplicate}`,
          source: duplicate,
        },
      }),
    );
  return Effect.succeed({
    tools: { ...local.tools, ...remote.tools },
    handle: (name, params, id, options) =>
      (Object.hasOwn(remote.tools, name) ? remote : local).handle(
        name,
        params,
        id,
        options,
      ),
  });
}

export const readMcpToolkit = Effect.gen(function* () {
  const client = yield* McpClient.McpClient;
  return Effect.fn("McpTools.read")(function* <
    Tools extends Record<string, Tool.Any>,
  >(local: Toolkit.WithHandler<Tools>) {
    const remote = yield* McpClient.toolkit(client, "mcp__").pipe(
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
    return yield* mergeMcpToolkit(local, remote);
  });
});
