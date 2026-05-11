import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { domainApiContents } from "../content/api";
import { domainChatContents, domainChatRpcContents } from "../content/chat";
import { domainRpcContents } from "../content/rpc";
import { domainWebSocketContents } from "../content/websocket";

/**
 * Domain modules - shared domain schemas and RPC definitions
 */
export const domainModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("domain-api"),
    title: "Domain API",
    description: "Shared domain schemas and RPC definitions",
    visibility: "internal",
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
    id: ModuleId.make("domain-rpc"),
    title: "Domain RPC",
    description: "Shared RPC definitions for streaming over HTTP",
    visibility: "internal",
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
    id: ModuleId.make("domain-chat"),
    title: "Domain Chat",
    description:
      "Chat stream protocol, message schemas, and client state machine",
    visibility: "internal",
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
    id: ModuleId.make("domain-websocket"),
    title: "Domain WebSocket",
    description: "WebSocket RPC definitions for real-time presence",
    visibility: "internal",
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
