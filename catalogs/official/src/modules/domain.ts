import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../../templates/", import.meta.url));

const packageKind = "package";
const domainTarget = {
  kind: packageKind,
  name: "domain",
};

export const domainModules = defineModules(import.meta.url, [
  {
    id: "domain-api-contracts",
    supportedRuntimes: ["bun", "node", "deno"],
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
        contents: template("./domain-api-contracts/src/Api.ts"),
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
    id: "domain-rpc-contracts",
    supportedRuntimes: ["bun", "node", "deno"],
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
        contents: template("./domain-rpc-contracts/src/Rpc.ts"),
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
    id: "domain-todo-contracts",
    supportedRuntimes: ["bun", "node", "deno"],
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
        contents: template("./domain-todo-contracts/src/Todo.ts"),
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
    id: "domain-todo-http-contracts",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Domain Todo HTTP",
    description: "Todo HTTP API contract",
    visibility: "internal",
    supportedOn: [{ _tag: "identity", identity: domainTarget }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-todo-contracts",
      },
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-api-contracts",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/TodoApi.ts",
        contents: template("./domain-todo-http-contracts/src/TodoApi.ts"),
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
    id: "domain-todo-rpc-contracts",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Domain Todo RPC",
    description: "Todo RPC contract merged into the server RPC group",
    visibility: "internal",
    supportedOn: [{ _tag: "identity", identity: domainTarget }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-todo-contracts",
      },
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-rpc-contracts",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/TodoRpc.ts",
        contents: template("./domain-todo-rpc-contracts/src/TodoRpc.ts"),
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
    id: "domain-chat-contracts",
    supportedRuntimes: ["bun", "node", "deno"],
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
        contents: template("./domain-chat-contracts/src/Chat.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/ChatRpc.ts",
        contents: template("./domain-chat-contracts/src/ChatRpc.ts"),
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
    id: "domain-chat-managed-contracts",
    supportedRuntimes: ["bun", "node", "deno"],
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
        moduleId: "domain-chat-contracts",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/ChatManagedRpc.ts",
        contents: template(
          "./domain-chat-managed-contracts/src/ChatManagedRpc.ts",
        ),
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
    id: "domain-ws-contracts",
    supportedRuntimes: ["bun", "node", "deno"],
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
        contents: template("./domain-ws-contracts/src/WebSocket.ts"),
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
]);
