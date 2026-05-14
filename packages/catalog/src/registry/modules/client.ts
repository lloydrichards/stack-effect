import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  clientHelloAtomContents,
  clientRestCardContents,
} from "../content/client-api";
import {
  clientChatAtomContents,
  clientChatBoxContents,
  clientChatRpcClientContents,
} from "../content/client-chat";
import {
  clientRpcCardContents,
  clientRpcClientContents,
  clientTickAtomContents,
} from "../content/client-rpc";
import {
  clientPresencePanelContents,
  clientWebSocketClientContents,
} from "../content/client-websocket";

/**
 * Client modules - frontend UI components and API clients
 */
export const clientModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("http-api-client"),
    title: "HTTP API Client",
    description: "REST API client with Effect Atom and typed HttpApiClient",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("client") }],
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
    implies: [
      {
        targetKind: TargetKind.make("server"),
        moduleId: ModuleId.make("http-api-server"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/atoms/hello-atom.ts",
        contents: clientHelloAtomContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/rest-card.tsx",
        contents: clientRestCardContents,
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
    id: ModuleId.make("http-rpc-client"),
    title: "HTTP RPC Client",
    description: "RPC streaming client with tick atom and UI",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("client") }],
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
    implies: [
      {
        targetKind: TargetKind.make("server"),
        moduleId: ModuleId.make("http-rpc-server"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/rpc-client.ts",
        contents: clientRpcClientContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/atoms/tick-atom.ts",
        contents: clientTickAtomContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/rpc-card.tsx",
        contents: clientRpcCardContents,
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
    id: ModuleId.make("chat-client"),
    title: "Chat Client",
    description: "AI chat UI with streaming, tool calls, and state machine",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("client") }],
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
    implies: [
      {
        targetKind: TargetKind.make("server"),
        moduleId: ModuleId.make("chat-server"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/chat-rpc-client.ts",
        contents: clientChatRpcClientContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/atoms/chat-atom.ts",
        contents: clientChatAtomContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/chat-box.tsx",
        contents: clientChatBoxContents,
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
    id: ModuleId.make("ws-presence-client"),
    title: "WebSocket Presence Client",
    description: "Real-time presence UI with WebSocket RPC",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("client") }],
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
    implies: [
      {
        targetKind: TargetKind.make("server"),
        moduleId: ModuleId.make("ws-presence-server"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/web-socket-client.ts",
        contents: clientWebSocketClientContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/presence-panel.tsx",
        contents: clientPresencePanelContents,
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
        name: "@effect/platform-browser",
        value: "4.0.0-beta.65",
      },
    ],
  },
];
