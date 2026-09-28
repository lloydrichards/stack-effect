import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../../templates/", import.meta.url));

const mcpServerKind = "server-mcp";
const aiTarget = {
  kind: "package",
  name: "ai",
};

export const mcpModules = defineModules(import.meta.url, [
  {
    id: "mcp-tools",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "MCP Tools",
    description: "Expose Effect AI toolkits through the MCP server",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    children: [
      {
        moduleId: "mcp-toolkit-datetime",
        requirement: "optional",
      },
      {
        moduleId: "mcp-toolkit-math",
        requirement: "optional",
      },
    ],
    contributions: [],
  },
  {
    id: "mcp-toolkit-datetime",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Date and Time Toolkit",
    description: "Expose the shared date and time toolkit through MCP",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: aiTarget,
        moduleId: "package-ai-toolkit-datetime",
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/ai",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "McpCapabilities",
        functionName: "Layer.mergeAll",
        argument:
          "McpServer.toolkit(DateTimeToolkit).pipe(Layer.provide(DateTimeToolkitLive))",
        import: {
          moduleSpecifier: "@repo/ai",
          namedImports: ["DateTimeToolkit", "DateTimeToolkitLive"],
        },
      },
    ],
  },
  {
    id: "mcp-toolkit-math",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Math Toolkit",
    description: "Expose the shared deterministic math toolkit through MCP",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: aiTarget,
        moduleId: "package-ai-toolkit-math",
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/ai",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "McpCapabilities",
        functionName: "Layer.mergeAll",
        argument:
          "McpServer.toolkit(MathToolkit).pipe(Layer.provide(MathToolkitLive))",
        import: {
          moduleSpecifier: "@repo/ai",
          namedImports: ["MathToolkit", "MathToolkitLive"],
        },
      },
    ],
  },
  {
    id: "mcp-prompts",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "MCP Prompts",
    description: "Add reusable prompt templates to the MCP server",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    children: [
      {
        moduleId: "mcp-prompt-hello",
        requirement: "optional",
      },
    ],
    contributions: [],
  },
  {
    id: "mcp-prompt-hello",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Hello Prompt",
    description: "Example parameterized MCP greeting prompt",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/prompts/HelloPrompt.ts",
        contents: template("./mcp-prompt-hello/src/prompts/HelloPrompt.ts"),
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "McpCapabilities",
        functionName: "Layer.mergeAll",
        argument: "HelloPromptLive",
        import: {
          moduleSpecifier: "./prompts/HelloPrompt",
          namedImports: ["HelloPromptLive"],
        },
      },
    ],
  },
  {
    id: "mcp-resources",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "MCP Resources",
    description: "Publish static and templated content through MCP",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    children: [
      {
        moduleId: "mcp-resource-primer",
        requirement: "optional",
      },
    ],
    contributions: [],
  },
  {
    id: "mcp-resource-primer",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Primer Resource",
    description: "Example static text resource describing the generated server",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/resources/PrimerResource.ts",
        contents: template(
          "./mcp-resource-primer/src/resources/PrimerResource.ts",
        ),
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "McpCapabilities",
        functionName: "Layer.mergeAll",
        argument: "PrimerResourceLive",
        import: {
          moduleSpecifier: "./resources/PrimerResource",
          namedImports: ["PrimerResourceLive"],
        },
      },
    ],
  },
]);
