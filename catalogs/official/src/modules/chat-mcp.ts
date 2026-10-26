import { defineModules, templates, type ModuleInput } from "@repo/authoring";

const template = templates(new URL("../../templates/", import.meta.url));
const capabilities = [
  {
    id: "tools",
    title: "MCP Tools",
    description: "Add remote tools to the existing agentic loop",
    maker: "makeMcpTools",
    file: "McpTools.ts",
  },
  {
    id: "resources",
    title: "MCP Resources",
    description: "Add selected remote text resources to the chat context",
    maker: "makeMcpResources",
    file: "McpResources.ts",
  },
  {
    id: "prompts",
    title: "MCP Prompts",
    description: "Add a selected remote prompt and its arguments to chat",
    maker: "makeMcpPrompts",
    file: "McpPrompts.ts",
  },
] as const;

type AppKind = "server" | "cli";

export const chatMcpChildren = (kind: AppKind) => [
  {
    moduleId: `${kind}-chat-mcp`,
    requirement: "optional" as const,
  },
];

export const chatMcpModules = defineModules(
  import.meta.url,
  (["server", "cli"] as const).flatMap((kind) => {
    const parent = kind === "server" ? "server-chat-rpc" : "cli-chat-driver";
    const target = { kind, name: kind === "server" ? "api" : "app" };
    const runtime =
      kind === "server" ? "runtime/ChatRuntime.ts" : "chat/ChatDriver.ts";
    const importPath = "../mcp/McpClient";
    const connection = `${kind}-chat-mcp`;
    return [
      {
        id: connection,
        title: "MCP Client",
        description:
          "An app-owned HTTP MCP connection shared by the selected chat capabilities",
        visibility: "public",
        children: capabilities.map(({ id }) => ({
          moduleId: `${connection}-${id}`,
          requirement: "optional" as const,
        })),
        supportedRuntimes: ["bun", "node", "deno"],
        supportedOn: [{ _tag: "kind", kind }],
        dependencies: [{ _tag: "required-module", target, moduleId: parent }],
        contributions: [
          {
            _tag: "file",
            path: "{{targetPath}}/src/mcp/McpClient.ts",
            contents: template("./chat-mcp/src/McpClient.ts"),
          },
          {
            _tag: "file",
            path: "{{targetPath}}/MCP.md",
            contents: template(
              kind === "server"
                ? "./chat-mcp/MCP.server.md"
                : "./chat-mcp/MCP.md",
            ),
          },
          {
            _tag: "ts-call-arg" as const,
            path: `{{targetPath}}/src/${runtime}`,
            targetVariable:
              kind === "server"
                ? "ChatRuntimeDependencies"
                : "TerminalChatDependencies",
            functionName: "Layer.mergeAll",
            argument: "McpClientLive",
            import: {
              moduleSpecifier: importPath,
              namedImports: ["McpClientLive"],
            },
          },
        ],
        nextSteps: [
          "Chat MCP: set MCP_SERVER_URL to your remote MCP endpoint. Configure the selected capabilities in {{targetPath}}/MCP.md.",
        ],
      },
      ...capabilities.map(
        ({ id, title, description, maker, file }): ModuleInput => ({
          id: `${connection}-${id}`,
          title,
          description,
          supportedRuntimes: ["bun", "node", "deno"],
          supportedOn: [{ _tag: "kind", kind }],
          dependencies: [
            { _tag: "required-module", target, moduleId: parent },
            { _tag: "required-module", target, moduleId: connection },
            ...(id === "resources"
              ? [
                  {
                    _tag: "required-module" as const,
                    target: { kind: "package", name: "domain" },
                    moduleId: "domain-mcp-resources",
                  },
                ]
              : []),
            ...(id === "prompts"
              ? [
                  {
                    _tag: "required-module" as const,
                    target: { kind: "package", name: "domain" },
                    moduleId:
                      kind === "server"
                        ? "domain-chat-mcp-prompts"
                        : "domain-chat-mcp-options",
                  },
                ]
              : []),
          ],
          contributions: [
            {
              _tag: "file",
              path: `{{targetPath}}/src/mcp/${file}`,
              contents: template(`./chat-mcp/src/${file}`),
            },
            ...(id === "prompts"
              ? [
                  {
                    _tag: "ts-call-arg" as const,
                    path: `{{targetPath}}/src/${runtime}`,
                    targetVariable: "ChatTurnPreparations",
                    functionName: "Effect.all",
                    argument: "makeMcpPromptPreparation",
                    import: {
                      moduleSpecifier: `../mcp/McpPrompts`,
                      namedImports: ["makeMcpPromptPreparation"],
                    },
                  },
                  {
                    _tag: "ts-call-arg" as const,
                    path: `{{targetPath}}/src/${runtime}`,
                    targetVariable:
                      kind === "server"
                        ? "ChatRuntimeDependencies"
                        : "TerminalChatDependencies",
                    functionName: "Layer.mergeAll",
                    argument: "McpPromptsLive",
                    import: {
                      moduleSpecifier: `../mcp/McpPrompts`,
                      namedImports: ["McpPromptsLive"],
                    },
                  },
                  {
                    _tag: "ts-call-arg" as const,
                    path: `{{targetPath}}/src/${runtime}`,
                    targetVariable: "ChatTurnOptionKeys",
                    functionName: "chatTurnOptionKeys",
                    argument: '"prompt"',
                    import: {
                      moduleSpecifier: `../mcp/McpPrompts`,
                      namedImports: ["makeMcpPromptPreparation"],
                    },
                  },
                ]
              : []),
            ...(id === "prompts"
              ? kind === "cli"
                ? [
                    {
                      _tag: "file" as const,
                      path: "{{targetPath}}/src/mcp/McpPromptOptions.ts",
                      contents: template("./chat-mcp/src/McpPromptOptions.ts"),
                    },
                    {
                      _tag: "file" as const,
                      path: "{{targetPath}}/src/mcp/McpPromptCommands.ts",
                      contents: template("./chat-mcp/src/McpPromptCommands.ts"),
                    },
                    {
                      _tag: "ts-call-arg" as const,
                      path: "{{targetPath}}/src/chat/ChatCommandConfiguration.ts",
                      targetVariable: "ChatCommandDependencies",
                      functionName: "Layer.mergeAll",
                      argument: "McpPromptsLive",
                      import: {
                        moduleSpecifier: "../mcp/McpPrompts",
                        namedImports: ["McpPromptsLive"],
                      },
                    },
                    {
                      _tag: "ts-call-arg" as const,
                      path: "{{targetPath}}/src/chat/ChatCommandConfiguration.ts",
                      targetVariable: "ChatCommandConfiguration",
                      functionName: "pipe",
                      argument: "withMcpPromptCommands",
                      import: {
                        moduleSpecifier: "../mcp/McpPromptCommands",
                        namedImports: ["withMcpPromptCommands"],
                      },
                    },
                  ]
                : [
                    {
                      _tag: "file" as const,
                      path: "{{targetPath}}/src/rpc/Prompt.ts",
                      contents: template("./chat-mcp/src/rpc/Prompt.ts"),
                    },
                    {
                      _tag: "ts-call-arg" as const,
                      path: "{{targetPath}}/src/index.ts",
                      targetVariable: "AllRouters",
                      functionName: "Layer.mergeAll",
                      argument: "PromptRpcLive",
                      import: {
                        moduleSpecifier: "./rpc/Prompt",
                        namedImports: ["PromptRpcLive"],
                      },
                    },
                  ]
              : [
                  {
                    _tag: "ts-call-arg" as const,
                    path: `{{targetPath}}/src/${runtime}`,
                    targetVariable: "ChatTurnPreparations",
                    functionName: "Effect.all",
                    argument: maker,
                    import: {
                      moduleSpecifier: `../mcp/${file.replace(".ts", "")}`,
                      namedImports: [maker],
                    },
                  },
                ]),
          ],
        }),
      ),
    ] satisfies ReadonlyArray<ModuleInput>;
  }),
);
