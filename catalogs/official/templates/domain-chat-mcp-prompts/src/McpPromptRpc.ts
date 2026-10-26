import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { McpPromptDescriptor, McpPromptError } from "./McpPrompt";
export class McpPromptRpc extends RpcGroup.make(
  Rpc.make("prompts_list", {
    success: Schema.Array(McpPromptDescriptor),
    error: McpPromptError,
  }),
) {}
