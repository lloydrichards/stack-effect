# Add MCP capabilities to chat

This app connects to one MCP server over Streamable HTTP. The selected MCP modules extend the existing chat or ask flow. They do not add a separate command or change the model provider.

## Configure the connection

Set `MCP_SERVER_URL` to your remote MCP endpoint, for example `http://localhost:9009/mcp`.
The default protocol is `2026-07-28`. Set `MCP_PROTOCOL_VERSION=2025-11-25` if the remote server requires it.
Set `MCP_AUTH_TOKEN` if the server requires a bearer token.

The app's chat runtime owns the connection. Selected capabilities share it until that runtime closes. CLI help and unrelated commands do not connect. The client uses Effect's default initialization and discovery deadlines, with no additional retry policy.

## Choose capabilities

Select **MCP Client** beneath your chat feature, then enable tools, resources, or prompts beneath it. `src/mcp/McpClient.ts` contains only the connection. Each selected option adds its own `McpTools.ts`, `McpResources.ts`, or `McpPrompts.ts` file. Unselected options add no implementation code.

- MCP tools discovers remote tools for each generation and adds them alongside local tools. Remote names start with `mcp__`. The model selects calls through the existing agentic loop and receives their results on subsequent turns. Duplicate tool names fail instead of replacing another tool.
- MCP resources reads only the URIs in `MCP_RESOURCE_URIS`, a nonempty JSON array such as `["stack-effect://primer"]`. Text content is added as attributed user context before the current request.
- MCP prompts lets the caller discover a prompt, select its name, and supply string arguments for that request. Rendering happens once before the model loop. User and assistant message roles are preserved. Ordinary turns do not discover or fetch prompts.

Only configure a capability's selection when that module is enabled. The generated MCP server also offers date/time and math tools when their server modules are selected.

Resource and prompt content must be text. Unsupported content, missing prompts, and remote failures fail the generation through the existing chat error events. Invalid connection or resource configuration fails chat runtime construction. Invalid prompt selection fails its request. Remote context does not replace the app's system instructions or previous conversation history.

For tool-specific approval or result handling, edit the app's `src/mcp/McpTools.ts` before exposing those tools to the model. This starter does not add OAuth, stdio transport, or multiple remote servers.

## Select a prompt

CLI apps expose prompt options on the existing `ask` and `chat` commands:

```sh
bun run start -- ask --list-prompts
bun run start -- ask --prompt hello --prompt-arg name=Ada
bun run start -- chat --prompt hello --prompt-arg name=Ada
```

Use a name and argument keys returned by discovery. A prompt can supply the complete request, so `ask` does not require an extra message when `--prompt` is present. Interactive chat renders the selected prompt at startup and retains those messages in its conversation history.

Server apps expose `prompts_list` on `/chat-prompts-rpc`. Pass the selection in the chat request's options:

```ts
{
  chatId,
  messages: [],
  options: {
    prompt: { name: "hello", arguments: { name: "Ada" } },
  },
}
```

`chat_ask` and managed `chat_send` forward options to the app's preparations. Managed chat still requires its message field. Selection is local to that request; subsequent requests do not reuse it. A server without the Prompts module rejects prompt options even when another app shares its domain schemas.

## Customize the integration

`ChatTurnOptions` defines the request fields. Each app's chat driver or runtime declares its supported option keys, preparation factories, and dependency layers. Optional modules register at these named composition points. Their behavior lives in feature-owned files.

CLI commands use `ChatCommandConfiguration` for typed flags and actions, and `ChatCommandDependencies` for command-scoped services. Prompt discovery and rendering live in `McpPrompts`; the generic chat runtime has no prompt discovery methods.
