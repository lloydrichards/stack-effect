import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { serverHealthContents, serverHelloContents } from "../content/api";
import { serverChatContents } from "../content/chat";
import { serverTickContents } from "../content/rpc";
import { serverPresenceContents } from "../content/websocket";

/**
 * Server modules - backend API handlers and services
 */
export const serverModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("http-api-server"),
    title: "HTTP API Server",
    description: "REST API endpoints with Effect HTTP",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
        moduleId: ModuleId.make("domain-api"),
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
    id: ModuleId.make("http-rpc-server"),
    title: "HTTP RPC Server",
    description: "RPC streaming server with tick handler",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
        moduleId: ModuleId.make("domain-rpc"),
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
    ],
  },
  {
    id: ModuleId.make("chat-server"),
    title: "Chat Server",
    description: "AI chat RPC handler with tool support",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
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
        moduleId: ModuleId.make("ai-chat-service"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/Chat.ts",
        contents: serverChatContents,
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
        targetVariable: "HttpRpcRouter",
        functionName: "Layer.provide",
        argument: "ChatServiceLive",
        import: {
          moduleSpecifier: "@repo/ai",
          namedImports: ["ChatServiceLive"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "HttpRpcRouter",
        functionName: "Layer.provide",
        argument: "SampleToolkitLive",
        import: {
          moduleSpecifier: "@repo/ai",
          namedImports: ["SampleToolkitLive"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "HttpRpcRouter",
        functionName: "Layer.provide",
        argument: "FastModelLive",
        import: {
          moduleSpecifier: "@repo/ai",
          namedImports: ["FastModelLive"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("ws-presence-server"),
    title: "WebSocket Presence Server",
    description: "Real-time presence tracking over WebSocket RPC",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
        moduleId: ModuleId.make("domain-websocket"),
      },
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "presence",
        }),
        moduleId: ModuleId.make("presence"),
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
        targetVariable: "WebSocketRpcRouter",
        functionName: "Layer.provide",
        argument: "PresenceServiceLive",
        import: {
          moduleSpecifier: "@repo/presence",
          namedImports: ["PresenceServiceLive"],
        },
      },
    ],
  },
];
