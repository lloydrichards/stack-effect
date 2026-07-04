import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { domainApiContents } from "../content/api";
import {
  domainChatContents,
  domainChatManagedRpcContents,
  domainChatRpcContents,
} from "../content/chat";
import { domainRpcContents } from "../content/rpc";
import { domainWebSocketContents } from "../content/websocket";

const packageKind = TargetKind.make("package");
const domainTarget = new TargetIdentity({
  kind: packageKind,
  name: "domain",
});

export const domainModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("domain-api-contracts"),
    title: "Domain API",
    description: "Shared domain schemas and RPC definitions",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: domainTarget,
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Api.ts",
        contents: domainApiContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./Api",
        value: "./src/Api.ts",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./Api",
      },
    ],
  },
  {
    id: ModuleId.make("domain-rpc-contracts"),
    title: "Domain RPC",
    description: "Shared RPC definitions for streaming over HTTP",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: domainTarget,
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc.ts",
        contents: domainRpcContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./Rpc",
        value: "./src/Rpc.ts",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./Rpc",
      },
    ],
  },
  {
    id: ModuleId.make("domain-chat-contracts"),
    title: "Domain Chat",
    description:
      "Chat stream protocol, message schemas, and client state machine",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: domainTarget,
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Chat.ts",
        contents: domainChatContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/ChatRpc.ts",
        contents: domainChatRpcContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./Chat",
        value: "./src/Chat.ts",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./ChatRpc",
        value: "./src/ChatRpc.ts",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./Chat",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./ChatRpc",
      },
    ],
  },
  {
    id: ModuleId.make("domain-chat-managed-contracts"),
    title: "Domain Managed Chat",
    description: "Managed chat send, watch, and interrupt RPC definitions",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: domainTarget,
      },
    ],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-chat-contracts"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/ChatManagedRpc.ts",
        contents: domainChatManagedRpcContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./ChatManagedRpc",
        value: "./src/ChatManagedRpc.ts",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./ChatManagedRpc",
      },
    ],
  },
  {
    id: ModuleId.make("domain-ws-contracts"),
    title: "Domain WebSocket",
    description: "WebSocket RPC definitions for real-time presence",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: domainTarget,
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/WebSocket.ts",
        contents: domainWebSocketContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./WebSocket",
        value: "./src/WebSocket.ts",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./WebSocket",
      },
    ],
  },
];
