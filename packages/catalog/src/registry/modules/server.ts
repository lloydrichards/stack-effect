import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { serverHealthContents, serverHelloContents } from "../content/api";
import {
  serverChatContents,
  serverChatManagedContents,
  serverChatManagedRuntimeContents,
  serverChatRuntimeContents,
  serverChatSessionsContents,
} from "../content/chat";
import { serverTickContents } from "../content/rpc";
import { serverDevToolsContents } from "../content/server";
import { serverPresenceContents } from "../content/websocket";

const serverKind = TargetKind.make("server");
const packageKind = TargetKind.make("package");
const domainTarget = new TargetIdentity({
  kind: packageKind,
  name: "domain",
});
const aiTarget = new TargetIdentity({
  kind: packageKind,
  name: "ai",
});
const presenceTarget = new TargetIdentity({
  kind: packageKind,
  name: "presence",
});

export const serverModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("server-http-api"),
    title: "HTTP API Server",
    description: "REST API endpoints with Effect HTTP",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-api-contracts"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Api/Health.ts",
        contents: serverHealthContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/Api/Hello.ts",
        contents: serverHelloContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "workspace:*",
      },
    ],
  },
  {
    id: ModuleId.make("server-http-rpc"),
    title: "HTTP RPC Server",
    description: "RPC streaming server with tick handler",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-rpc-contracts"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/Event.ts",
        contents: serverTickContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "workspace:*",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "EventRpcLive",
        import: {
          moduleSpecifier: "./Rpc/Event",
          namedImports: ["EventRpcLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("server-chat-rpc"),
    title: "Chat Server",
    description: "AI chat RPC handler with tool support",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-chat-contracts"),
      },
      {
        _tag: "required-module",
        target: aiTarget,
        moduleId: ModuleId.make("package-ai-chat-service"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/Chat.ts",
        contents: serverChatContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/runtime/ChatSessions.ts",
        contents: serverChatSessionsContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/runtime/ChatRuntime.ts",
        contents: serverChatRuntimeContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/ai",
        value: "workspace:*",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "workspace:*",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "ChatRpcLive",
        import: {
          moduleSpecifier: "./Rpc/Chat",
          namedImports: ["ChatRpcLive"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "RouterDependencies",
        functionName: "Layer.mergeAll",
        argument: "ChatSessionsLive",
        import: {
          moduleSpecifier: "./runtime/ChatSessions",
          namedImports: ["ChatSessionsLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("server-chat-runtime-managed"),
    title: "Managed Chat Runtime",
    description: "In-memory managed chat send, watch, and interrupt runtime",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-chat-managed-contracts"),
      },
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "api",
        }),
        moduleId: ModuleId.make("server-chat-rpc"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/ChatManaged.ts",
        contents: serverChatManagedContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/runtime/ChatManagedRuntime.ts",
        contents: serverChatManagedRuntimeContents,
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "ChatManagedRpcLive",
        import: {
          moduleSpecifier: "./Rpc/ChatManaged",
          namedImports: ["ChatManagedRpcLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("server-ws-presence"),
    title: "WebSocket Presence Server",
    description: "Real-time presence tracking over WebSocket RPC",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-ws-contracts"),
      },
      {
        _tag: "required-module",
        target: presenceTarget,
        moduleId: ModuleId.make("package-presence-service"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/Presence.ts",
        contents: serverPresenceContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/presence",
        value: "workspace:*",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "workspace:*",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "PresenceRpcLive",
        import: {
          moduleSpecifier: "./Rpc/Presence",
          namedImports: ["PresenceRpcLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("server-devtools"),
    title: "Effect DevTools Server",
    description: "Optional Effect DevTools tracer layer for server apps",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/observability/DevTools.ts",
        contents: serverDevToolsContents,
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "ServerLayers",
        functionName: "Layer.mergeAll",
        argument: "DevToolsLive",
        import: {
          moduleSpecifier: "./observability/DevTools",
          namedImports: ["DevToolsLive"],
        },
      },
    ],
  },
];
