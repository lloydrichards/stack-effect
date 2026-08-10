import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  mcpHelloPromptContents,
  mcpPrimerResourceContents,
} from "../content/mcp";

const mcpServerKind = TargetKind.make("server-mcp");
const aiTarget = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "ai",
});

export const mcpModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("mcp-tools"),
    title: "MCP Tools",
    description: "Expose Effect AI toolkits through the MCP server",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    children: [
      {
        moduleId: ModuleId.make("mcp-toolkit-datetime"),
        requirement: "optional",
      },
      {
        moduleId: ModuleId.make("mcp-toolkit-math"),
        requirement: "optional",
      },
    ],
    contributions: [],
  },
  {
    id: ModuleId.make("mcp-toolkit-datetime"),
    title: "Date and Time Toolkit",
    description: "Expose the shared date and time toolkit through MCP",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: aiTarget,
        moduleId: ModuleId.make("package-ai-toolkit-datetime"),
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
    id: ModuleId.make("mcp-toolkit-math"),
    title: "Math Toolkit",
    description: "Expose the shared deterministic math toolkit through MCP",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: aiTarget,
        moduleId: ModuleId.make("package-ai-toolkit-math"),
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
    id: ModuleId.make("mcp-prompts"),
    title: "MCP Prompts",
    description: "Add reusable prompt templates to the MCP server",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    children: [
      {
        moduleId: ModuleId.make("mcp-prompt-hello"),
        requirement: "optional",
      },
    ],
    contributions: [],
  },
  {
    id: ModuleId.make("mcp-prompt-hello"),
    title: "Hello Prompt",
    description: "Example parameterized MCP greeting prompt",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/prompts/HelloPrompt.ts",
        contents: mcpHelloPromptContents,
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
    id: ModuleId.make("mcp-resources"),
    title: "MCP Resources",
    description: "Publish static and templated content through MCP",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    children: [
      {
        moduleId: ModuleId.make("mcp-resource-primer"),
        requirement: "optional",
      },
    ],
    contributions: [],
  },
  {
    id: ModuleId.make("mcp-resource-primer"),
    title: "Primer Resource",
    description: "Example static text resource describing the generated server",
    supportedOn: [{ _tag: "kind", kind: mcpServerKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/resources/PrimerResource.ts",
        contents: mcpPrimerResourceContents,
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
];
