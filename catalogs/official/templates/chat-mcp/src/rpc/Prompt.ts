import { McpPromptRpc } from "@repo/domain/McpPromptRpc";
import { McpPromptError } from "@repo/domain/McpPrompt";
import { Effect, Layer } from "effect";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { McpPrompts, McpPromptsLayer } from "../mcp/McpPrompts";
const PromptHandlers = McpPromptRpc.toLayer(
  Effect.gen(function* () {
    const prompts = yield* McpPrompts;
    return McpPromptRpc.of({
      prompts_list: () =>
        prompts
          .list()
          .pipe(
            Effect.mapError(
              (error) => new McpPromptError({ message: error.message }),
            ),
          ),
    });
  }),
);
export const PromptRpcRoutes = RpcServer.layerHttp({
  group: McpPromptRpc,
  path: "/chat-prompts-rpc",
  protocol: "http",
}).pipe(
  Layer.provide(PromptHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(McpPromptsLayer),
);
