# Use MCP in server chat

The server owns one HTTP MCP connection. Tools, Resources, and Prompts extend the existing chat loop through the named preparations and dependency layers in `src/runtime/ChatRuntime.ts`.

## Run the paired example

The commands below use Bun and assume the MCP server target is named `remote` and this API target is named `{{targetName}}`. For Node, run the same package scripts with your package manager; the generated scripts use `tsx`. Deno scripts include their required permissions.

Select these modules when creating or extending your workspace:

```sh
stack-effect add --yes \
  --target server-mcp/remote:mcp-prompt-briefing \
  --target server/{{targetName}}:server-chat-mcp-tools,server-chat-mcp-resources,server-chat-mcp-prompts
```

The Briefing Prompt brings its calculator and primer dependencies. Start the MCP server in one terminal:

```sh
bun run --cwd apps/server-mcp-remote dev
```

Start the API in another terminal, using your own model credential:

```sh
export ANTHROPIC_API_KEY=your-api-key
export MCP_SERVER_URL=http://localhost:9009/mcp
export MCP_RESOURCE_URIS='["stack-effect://primer"]'
bun run --cwd {{targetPath}} dev
```

From your application, discover available prompts through `McpPromptRpc.prompts_list` at `/chat-prompts-rpc`. Then use `ChatRpc` at `/chat-rpc` to create a chat and stream the selected prompt:

```ts
const { chatId } = yield* chatClient.chat_start();
yield* chatClient.chat_ask({
  chatId,
  messages: [],
  options: { prompt: { name: "briefing", arguments: { name: "Ada" } } },
}).pipe(Stream.runForEach(handleChatPart));
```

Build both clients with `RpcClient.make` and their corresponding `@repo/domain` RPC groups. Use `RpcClient.layerProtocolHttp` for each route and `RpcSerialization.layerNdjson` for serialization. Prompt selection comes from the caller, rather than environment variables.

The briefing uses the primer's team, project, and workshop quantities. It asks the model to call `mcp__calculate` for `6 * 7`, then include 42 kits in the response. The chat stream includes tool starts, results, and response text. Response wording and tool choices depend on your model; the prompt explains what to do if context or a tool is unavailable.

The MCP server publishes the primer. The API reads it from `MCP_RESOURCE_URIS` and supplies it as context. Selecting a prompt does not automatically fetch its referenced resources or enable its tools.

## Connection and errors

`MCP_PROTOCOL_VERSION` defaults to `2026-07-28`; use `2025-11-25` for servers requiring it. Set `MCP_AUTH_TOKEN` for a remote server requiring a bearer token. The generated example server does not implement bearer-token validation.

Discovery uses Effect's default deadlines. Prompt rendering, resource reads, and tool execution use the transport's operation behavior; this starter does not add retries or a request deadline. Supply an application deadline where your deployment requires one.

Chat error events include a message, `recoverable`, and an optional structured `reason`. Invalid prompt arguments use `reason.code === "invalid-input"` and are recoverable. Unsupported content, remote failures, and duplicate tool names have separate codes. Full diagnostic causes stay in server logs.

Prompt selection applies to one request. Rendered messages retain their user/assistant roles and are fetched once before the model's tool loop. Ordinary requests do not list or render prompts.

## Extend the example

On the MCP server:

- Add a prompt file under `src/prompts`, define its public arguments in `@repo/domain`, and register its layer in `McpCapabilities`. `HelloPrompt.ts` is a minimal independent example; `BriefingPrompt.ts` demonstrates a combined task.
- Add a resource file under `src/resources` and register its layer in `McpCapabilities`. Choose a stable URI and update the API's `MCP_RESOURCE_URIS` if it should supply that resource to chat.
- Define a toolkit and handler layer, then register `McpServer.toolkit(YourToolkit).pipe(Layer.provide(YourToolkitLive))` in `McpCapabilities`. Keep app-specific implementations in the app; share toolkits through `@repo/ai` only when other apps need them.

On the API, customize `src/mcp/McpTools.ts`, `src/mcp/McpResources.ts`, or `src/mcp/McpPrompts.ts`. `src/mcp/McpClient.ts` owns the shared connection. Domain modules own models and errors. `McpPromptsShape` stays beside the service because it describes operations and Effect requirements. The domain models module is independent of chat; a separate module contributes the chat prompt option.

Only selected capabilities generate implementation files. This starter supports text resources and text prompt messages from one HTTP MCP server. Unsupported content fails explicitly.
