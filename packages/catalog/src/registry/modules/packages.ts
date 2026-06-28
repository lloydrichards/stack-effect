import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  aiAgenticLoopContents,
  aiChatServiceContents,
  aiDateTimeToolkitContents,
  aiIndexContents,
  aiLanguageModelContents,
  aiMailboxEventsContents,
  aiMathToolkitContents,
  aiMemoryToolkitContents,
  aiPlanToolkitContents,
  aiThinkToolkitContents,
  aiWebFetchToolkitContents,
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
        value: "4.0.0-beta.80",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "effect",
        value: "4.0.0-beta.80",
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
    id: ModuleId.make("ai-datetime-toolkit"),
    title: "DateTime Toolkit",
    description:
      "Timezone-aware date and time tool for time-sensitive agent behavior",
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
        path: "{{targetPath}}/src/toolkits/DateTimeToolkit.ts",
        contents: aiDateTimeToolkitContents,
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/DateTimeToolkit",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "DateTimeToolkit",
        import: {
          moduleSpecifier: "../toolkits/DateTimeToolkit",
          namedImports: ["DateTimeToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "DateTimeToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/DateTimeToolkit",
          namedImports: ["DateTimeToolkitLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("ai-math-toolkit"),
    title: "Math Toolkit",
    description: "Deterministic arithmetic evaluator for safe math computation",
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
        path: "{{targetPath}}/src/toolkits/MathToolkit.ts",
        contents: aiMathToolkitContents,
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/MathToolkit",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "MathToolkit",
        import: {
          moduleSpecifier: "../toolkits/MathToolkit",
          namedImports: ["MathToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "MathToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/MathToolkit",
          namedImports: ["MathToolkitLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("ai-memory-toolkit"),
    title: "Memory Toolkit",
    description:
      "Key-value scratchpad for persisting facts across tool invocations",
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
        path: "{{targetPath}}/src/toolkits/MemoryToolkit.ts",
        contents: aiMemoryToolkitContents,
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/MemoryToolkit",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "MemoryToolkit",
        import: {
          moduleSpecifier: "../toolkits/MemoryToolkit",
          namedImports: ["MemoryToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "InMemoryToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/MemoryToolkit",
          namedImports: ["InMemoryToolkitLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("ai-plan-toolkit"),
    title: "Plan Toolkit",
    description:
      "Structured task tracking that forces plan-before-act discipline",
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
        path: "{{targetPath}}/src/toolkits/PlanToolkit.ts",
        contents: aiPlanToolkitContents,
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/PlanToolkit",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "PlanToolkit",
        import: {
          moduleSpecifier: "../toolkits/PlanToolkit",
          namedImports: ["PlanToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "PlanToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/PlanToolkit",
          namedImports: ["PlanToolkitLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("ai-webfetch-toolkit"),
    title: "WebFetch Toolkit",
    description:
      "URL content retrieval with HTML stripping for retrieval-augmented workflows",
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
        path: "{{targetPath}}/src/toolkits/WebFetchToolkit.ts",
        contents: aiWebFetchToolkitContents,
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/WebFetchToolkit",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "WebFetchToolkit",
        import: {
          moduleSpecifier: "../toolkits/WebFetchToolkit",
          namedImports: ["WebFetchToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "WebFetchToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/WebFetchToolkit",
          namedImports: ["WebFetchToolkitLive"],
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
      {
        moduleId: ModuleId.make("ai-datetime-toolkit"),
        requirement: "optional",
      },
      { moduleId: ModuleId.make("ai-math-toolkit"), requirement: "optional" },
      { moduleId: ModuleId.make("ai-memory-toolkit"), requirement: "optional" },
      { moduleId: ModuleId.make("ai-plan-toolkit"), requirement: "optional" },
      {
        moduleId: ModuleId.make("ai-webfetch-toolkit"),
        requirement: "optional",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/AiChatService.ts",
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
        exportPath: "./services/AiChatService",
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
        value: "4.0.0-beta.80",
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
