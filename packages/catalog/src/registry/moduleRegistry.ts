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
} from "./content/ai";
import {
  domainApiContents,
  serverHealthContents,
  serverHelloContents,
} from "./content/api";
import {
  domainChatContents,
  domainChatRpcContents,
  serverChatContents,
} from "./content/chat";
import { configTypescriptViteContents } from "./content/client";
import {
  clientHelloAtomContents,
  clientRestCardContents,
} from "./content/client-api";
import {
  clientChatAtomContents,
  clientChatBoxContents,
  clientChatRpcClientContents,
} from "./content/client-chat";
import {
  clientRpcCardContents,
  clientRpcClientContents,
  clientTickAtomContents,
} from "./content/client-rpc";
import {
  clientPresencePanelContents,
  clientWebSocketClientContents,
} from "./content/client-websocket";
import {
  biomeJsoncContents,
  turboJsonContents,
  vitestConfigContents,
} from "./content/init";
import {
  presenceClientGeneratorContents,
  presenceIndexContents,
  presenceServiceContents,
} from "./content/presence";
import { domainRpcContents, serverTickContents } from "./content/rpc";
import {
  domainWebSocketContents,
  serverPresenceContents,
} from "./content/websocket";

export const moduleRegistry: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("turbo"),
    title: "Turborepo",
    description: "Monorepo build orchestration with caching",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("init") }],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("init"),
            name: "root",
          }),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/turbo.json",
          contents: turboJsonContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "devDependencies",
          name: "turbo",
          value: "^2.9.6",
        },
      ],
      scripts: [
        {
          path: "{{targetPath}}/package.json",
          name: "build",
          value: "turbo run build",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "dev",
          value: "turbo run dev",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "type-check",
          value: "turbo run type-check",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "clean",
          value:
            "turbo run clean && git clean -xdf node_modules .cache .turbo dist tsconfig.tsbuildinfo",
        },
      ],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("biome"),
    title: "Biome",
    description: "Fast linter and formatter",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("init") }],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("init"),
            name: "root",
          }),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/biome.jsonc",
          contents: biomeJsoncContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "devDependencies",
          name: "@biomejs/biome",
          value: "2.4.11",
        },
      ],
      scripts: [
        {
          path: "{{targetPath}}/package.json",
          name: "lint",
          value: "biome lint .",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "format",
          value: "biome check --write .",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "format:check",
          value: "biome check .",
        },
      ],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("vitest"),
    title: "Vitest",
    description: "Unit and integration testing framework",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("init") }],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("init"),
            name: "root",
          }),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/vitest.config.ts",
          contents: vitestConfigContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "devDependencies",
          name: "vitest",
          value: "^4.1.4",
        },
      ],
      scripts: [
        {
          path: "{{targetPath}}/package.json",
          name: "test",
          value: "turbo run test",
        },
      ],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("config-typescript-vite"),
    title: "Config TypeScript Vite",
    description: "Vite TypeScript preset for client applications",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("client") }],
    dependencies: [],
    contributions: {
      files: [
        {
          path: "packages/config-typescript/vite.json",
          contents: configTypescriptViteContents,
        },
      ],
      exports: [
        {
          path: "packages/config-typescript/package.json",
          name: "./base.json",
          value: "./base.json",
        },
        {
          path: "packages/config-typescript/package.json",
          name: "./vite.json",
          value: "./vite.json",
        },
      ],
      dependencies: [],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  // ---------------------------------------------------------------------------
  // add modules — app/package feature modules
  // ---------------------------------------------------------------------------
  {
    id: ModuleId.make("domain-api"),
    title: "Domain API",
    description: "Shared domain schemas and RPC definitions",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
      },
    ],
    dependencies: [],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/Api.ts",
          contents: domainApiContents,
        },
      ],
      exports: [
        {
          path: "{{targetPath}}/package.json",
          name: "./Api",
          value: "./src/Api.ts",
        },
      ],
      dependencies: [],
      scripts: [],
      barrelExports: [
        {
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: "./Api",
        },
      ],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("http-api-server"),
    title: "HTTP API Server",
    description: "REST API endpoints with Effect HTTP",
    supportedOn: [
      {
        _tag: "kind",
        kind: TargetKind.make("server"),
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-api"),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/Api/Health.ts",
          contents: serverHealthContents,
        },
        {
          path: "{{targetPath}}/src/Api/Hello.ts",
          contents: serverHelloContents,
        },
      ],
      exports: [],
      dependencies: [],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("http-api-client"),
    title: "HTTP API Client",
    description: "REST API client with Effect Atom and typed HttpApiClient",
    supportedOn: [
      {
        _tag: "kind",
        kind: TargetKind.make("client"),
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-api"),
        },
      },
    ],
    implies: [
      {
        targetKind: TargetKind.make("server"),
        moduleId: ModuleId.make("http-api-server"),
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/lib/atoms/hello-atom.ts",
          contents: clientHelloAtomContents,
        },
        {
          path: "{{targetPath}}/src/components/rest-card.tsx",
          contents: clientRestCardContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@repo/domain",
          value: "workspace:*",
        },
      ],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  // ---------------------------------------------------------------------------
  // RPC modules — HTTP RPC streaming (tick)
  // ---------------------------------------------------------------------------
  {
    id: ModuleId.make("domain-rpc"),
    title: "Domain RPC",
    description: "Shared RPC definitions for streaming over HTTP",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
      },
    ],
    dependencies: [],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/Rpc.ts",
          contents: domainRpcContents,
        },
      ],
      exports: [
        {
          path: "{{targetPath}}/package.json",
          name: "./Rpc",
          value: "./src/Rpc.ts",
        },
      ],
      dependencies: [],
      scripts: [],
      barrelExports: [
        {
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: "./Rpc",
        },
      ],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("http-rpc-server"),
    title: "HTTP RPC Server",
    description: "RPC streaming server with tick handler",
    supportedOn: [
      {
        _tag: "kind",
        kind: TargetKind.make("server"),
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-rpc"),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/Rpc/Event.ts",
          contents: serverTickContents,
        },
      ],
      exports: [],
      dependencies: [],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("http-rpc-client"),
    title: "HTTP RPC Client",
    description: "RPC streaming client with tick atom and UI",
    supportedOn: [
      {
        _tag: "kind",
        kind: TargetKind.make("client"),
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-rpc"),
        },
      },
    ],
    implies: [
      {
        targetKind: TargetKind.make("server"),
        moduleId: ModuleId.make("http-rpc-server"),
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/lib/rpc-client.ts",
          contents: clientRpcClientContents,
        },
        {
          path: "{{targetPath}}/src/lib/atoms/tick-atom.ts",
          contents: clientTickAtomContents,
        },
        {
          path: "{{targetPath}}/src/components/rpc-card.tsx",
          contents: clientRpcCardContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@repo/domain",
          value: "workspace:*",
        },
      ],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  // ---------------------------------------------------------------------------
  // Chat modules — AI chat streaming over HTTP RPC
  // ---------------------------------------------------------------------------
  {
    id: ModuleId.make("domain-chat"),
    title: "Domain Chat",
    description:
      "Chat stream protocol, message schemas, and client state machine",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
      },
    ],
    dependencies: [],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/Chat.ts",
          contents: domainChatContents,
        },
        {
          path: "{{targetPath}}/src/ChatRpc.ts",
          contents: domainChatRpcContents,
        },
      ],
      exports: [
        {
          path: "{{targetPath}}/package.json",
          name: "./Chat",
          value: "./src/Chat.ts",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "./ChatRpc",
          value: "./src/ChatRpc.ts",
        },
      ],
      dependencies: [],
      scripts: [],
      barrelExports: [
        {
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: "./Chat",
        },
        {
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: "./ChatRpc",
        },
      ],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("chat-server"),
    title: "Chat Server",
    description: "AI chat RPC handler with tool support",
    supportedOn: [
      {
        _tag: "kind",
        kind: TargetKind.make("server"),
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-chat"),
        },
      },
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "ai",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "ai",
          }),
          moduleId: ModuleId.make("ai-chat-service"),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/Rpc/Chat.ts",
          contents: serverChatContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@repo/ai",
          value: "workspace:*",
        },
      ],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("chat-client"),
    title: "Chat Client",
    description: "AI chat UI with streaming, tool calls, and state machine",
    supportedOn: [
      {
        _tag: "kind",
        kind: TargetKind.make("client"),
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-chat"),
        },
      },
    ],
    implies: [
      {
        targetKind: TargetKind.make("server"),
        moduleId: ModuleId.make("chat-server"),
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/lib/chat-rpc-client.ts",
          contents: clientChatRpcClientContents,
        },
        {
          path: "{{targetPath}}/src/lib/atoms/chat-atom.ts",
          contents: clientChatAtomContents,
        },
        {
          path: "{{targetPath}}/src/components/chat-box.tsx",
          contents: clientChatBoxContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@repo/domain",
          value: "workspace:*",
        },
      ],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  // ---------------------------------------------------------------------------
  // WebSocket modules — presence over WebSocket RPC
  // ---------------------------------------------------------------------------
  {
    id: ModuleId.make("domain-websocket"),
    title: "Domain WebSocket",
    description: "WebSocket RPC definitions for real-time presence",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
      },
    ],
    dependencies: [],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/WebSocket.ts",
          contents: domainWebSocketContents,
        },
      ],
      exports: [
        {
          path: "{{targetPath}}/package.json",
          name: "./WebSocket",
          value: "./src/WebSocket.ts",
        },
      ],
      dependencies: [],
      scripts: [],
      barrelExports: [
        {
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: "./WebSocket",
        },
      ],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("ws-presence-server"),
    title: "WebSocket Presence Server",
    description: "Real-time presence tracking over WebSocket RPC",
    supportedOn: [
      {
        _tag: "kind",
        kind: TargetKind.make("server"),
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-websocket"),
        },
      },
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "presence",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "presence",
          }),
          moduleId: ModuleId.make("presence"),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/Rpc/Presence.ts",
          contents: serverPresenceContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@repo/presence",
          value: "workspace:*",
        },
      ],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("ws-presence-client"),
    title: "WebSocket Presence Client",
    description: "Real-time presence UI with WebSocket RPC",
    supportedOn: [
      {
        _tag: "kind",
        kind: TargetKind.make("client"),
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-websocket"),
        },
      },
    ],
    implies: [
      {
        targetKind: TargetKind.make("server"),
        moduleId: ModuleId.make("ws-presence-server"),
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/lib/web-socket-client.ts",
          contents: clientWebSocketClientContents,
        },
        {
          path: "{{targetPath}}/src/components/presence-panel.tsx",
          contents: clientPresencePanelContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@repo/domain",
          value: "workspace:*",
        },
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@effect/platform-browser",
          value: "workspace:*",
        },
      ],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  // ---------------------------------------------------------------------------
  // Infrastructure packages — ai and presence
  // ---------------------------------------------------------------------------
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
    dependencies: [],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/index.ts",
          contents: aiIndexContents,
        },
        {
          path: "{{targetPath}}/src/LanguageModel.ts",
          contents: aiLanguageModelContents,
        },
        {
          path: "{{targetPath}}/src/workflow/MailboxEvents.ts",
          contents: aiMailboxEventsContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@effect/ai-anthropic",
          value: "4.0.0-beta.59",
        },
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "effect",
          value: "4.0.0-beta.59",
        },
      ],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
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
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/toolkits/SampleToolkit.ts",
          contents: aiSampleToolkitContents,
        },
      ],
      exports: [],
      dependencies: [],
      scripts: [],
      barrelExports: [
        {
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: "./toolkits/SampleToolkit",
        },
      ],
      tsconfigs: [],
    },
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
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-chat"),
        },
      },
      {
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "ai",
          }),
          moduleId: ModuleId.make("ai-sample-toolkit"),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/services/ChatService.ts",
          contents: aiChatServiceContents,
        },
        {
          path: "{{targetPath}}/src/workflow/AgenticLoop.ts",
          contents: aiAgenticLoopContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@repo/domain",
          value: "workspace:*",
        },
      ],
      scripts: [],
      barrelExports: [
        {
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: "./services/ChatService",
        },
        {
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: "./workflow/AgenticLoop",
        },
      ],
      tsconfigs: [],
    },
  },
  {
    id: ModuleId.make("presence"),
    title: "Presence Package",
    description:
      "Real-time presence tracking service with PubSub and client generation",
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
        requiredTarget: {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          moduleId: ModuleId.make("domain-websocket"),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/index.ts",
          contents: presenceIndexContents,
        },
        {
          path: "{{targetPath}}/src/services/ClientGenerator.ts",
          contents: presenceClientGeneratorContents,
        },
        {
          path: "{{targetPath}}/src/services/PresenceService.ts",
          contents: presenceServiceContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@repo/domain",
          value: "workspace:*",
        },
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "effect",
          value: "4.0.0-beta.59",
        },
      ],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
];
