import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  aiAgenticLoopContents,
  aiChatServiceContents,
  aiIndexContents,
  aiLanguageModelContents,
  aiMailboxEventsContents,
  aiSampleToolkitContents,
  aiThinkToolkitContents,
} from "../content/ai";
import {
  presenceClientGeneratorContents,
  presenceIndexContents,
  presenceServiceContents,
} from "../content/presence";

/**
 * Package modules - infrastructure packages (ai, presence)
 */
export const packageModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("ai"),
    title: "AI Package",
    description:
      "Anthropic language model configuration and workflow utilities",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "ai",
        }),
      },
    ],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
        moduleId: ModuleId.make("domain-chat"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: aiIndexContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/LanguageModel.ts",
        contents: aiLanguageModelContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/workflow/MailboxEvents.ts",
        contents: aiMailboxEventsContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@effect/ai-anthropic",
        value: "4.0.0-beta.67",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "effect",
        value: "4.0.0-beta.67",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "workspace:*",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: ".",
        value: "./src/index.ts",
      },
    ],
  },
  {
    id: ModuleId.make("ai-think-toolkit"),
    title: "Think Toolkit",
    description:
      "Minimal AI toolkit with a think tool for step-by-step reasoning",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "ai",
        }),
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/toolkits/ThinkToolkit.ts",
        contents: aiThinkToolkitContents,
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/ThinkToolkit",
      },
    ],
  },
  {
    id: ModuleId.make("ai-sample-toolkit"),
    title: "Sample Toolkit",
    description: "Sample AI toolkit with calculator, echo, and time tools",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "ai",
        }),
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/toolkits/SampleToolkit.ts",
        contents: aiSampleToolkitContents,
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/SampleToolkit",
      },
      // Add SampleToolkit to ChatToolkit merge
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/ChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "SampleToolkit",
        import: {
          moduleSpecifier: "../toolkits/SampleToolkit",
          namedImports: ["SampleToolkit"],
        },
      },
      // Add SampleToolkitLive to ChatToolkitLive merge
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/ChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "SampleToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/SampleToolkit",
          namedImports: ["SampleToolkitLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("ai-chat-service"),
    title: "Chat Service",
    description:
      "AI chat service with agentic loop for streaming tool-augmented conversations",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "ai",
        }),
      },
    ],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
        moduleId: ModuleId.make("domain-chat"),
      },
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "ai",
        }),
        moduleId: ModuleId.make("ai"),
      },
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "ai",
        }),
        moduleId: ModuleId.make("ai-think-toolkit"),
      },
    ],
    children: [
      { moduleId: ModuleId.make("ai-sample-toolkit"), requirement: "optional" },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/ChatService.ts",
        contents: aiChatServiceContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/workflow/AgenticLoop.ts",
        contents: aiAgenticLoopContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "workspace:*",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./services/ChatService",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./workflow/AgenticLoop",
      },
    ],
  },
  {
    id: ModuleId.make("presence"),
    title: "Presence Package",
    description:
      "Real-time presence tracking service with PubSub and client generation",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "presence",
        }),
      },
    ],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
        moduleId: ModuleId.make("domain-websocket"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: presenceIndexContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/ClientGenerator.ts",
        contents: presenceClientGeneratorContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/PresenceService.ts",
        contents: presenceServiceContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "workspace:*",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "effect",
        value: "4.0.0-beta.67",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: ".",
        value: "./src/index.ts",
      },
    ],
  },
];
