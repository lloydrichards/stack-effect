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
import {
  domainTodoApiContents,
  domainTodoContents,
  domainTodoRpcContents,
} from "../content/todo";
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
    id: ModuleId.make("domain-todo-contracts"),
    title: "Domain Todo",
    description: "Shared Todo schemas and errors",
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
        path: "{{targetPath}}/src/Todo.ts",
        contents: domainTodoContents,
      },
      ...["Todo"].flatMap((name) => [
        {
          _tag: "pkg-json-entry" as const,
          path: "{{targetPath}}/package.json",
          field: "exports" as const,
          name: `./${name}`,
          value: `./src/${name}.ts`,
        },
        {
          _tag: "barrel-export" as const,
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: `./${name}`,
        },
      ]),
    ],
  },
  {
    id: ModuleId.make("domain-todo-http-contracts"),
    title: "Domain Todo HTTP",
    description: "Todo HTTP API contract",
    visibility: "internal",
    supportedOn: [{ _tag: "identity", identity: domainTarget }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-todo-contracts"),
      },
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-api-contracts"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/TodoApi.ts",
        contents: domainTodoApiContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./TodoApi",
        value: "./src/TodoApi.ts",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./TodoApi",
      },
    ],
  },
  {
    id: ModuleId.make("domain-todo-rpc-contracts"),
    title: "Domain Todo RPC",
    description: "Todo RPC contract merged into the server RPC group",
    visibility: "internal",
    supportedOn: [{ _tag: "identity", identity: domainTarget }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-todo-contracts"),
      },
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-rpc-contracts"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/TodoRpc.ts",
        contents: domainTodoRpcContents,
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/Rpc.ts",
        targetVariable: "RpcApi",
        functionName: "EventRpc.merge",
        argument: "TodoRpc",
        import: {
          moduleSpecifier: "./TodoRpc",
          namedImports: ["TodoRpc"],
        },
      },
      ...["TodoRpc"].flatMap((name) => [
        {
          _tag: "pkg-json-entry" as const,
          path: "{{targetPath}}/package.json",
          field: "exports" as const,
          name: `./${name}`,
          value: `./src/${name}.ts`,
        },
        {
          _tag: "barrel-export" as const,
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: `./${name}`,
        },
      ]),
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
