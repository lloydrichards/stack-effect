import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../../templates/", import.meta.url));

const serverKind = "server";
const packageKind = "package";
const domainTarget = {
  kind: packageKind,
  name: "domain",
};
const aiTarget = {
  kind: packageKind,
  name: "ai",
};
const presenceTarget = {
  kind: packageKind,
  name: "presence",
};
const dbTarget = {
  kind: packageKind,
  name: "db",
};
const serverApiTarget = {
  kind: serverKind,
  name: "api",
};

export const serverModules = defineModules(import.meta.url, [
  {
    id: "server-http-api",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "HTTP API Server",
    description: "REST API endpoints with Effect HTTP",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-api-contracts",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Api/Health.ts",
        contents: template("./server-http-api/src/Api/Health.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/Api/Hello.ts",
        contents: template("./server-http-api/src/Api/Hello.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
    ],
  },
  {
    id: "server-http-rpc",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "HTTP RPC Server",
    description: "RPC streaming server with tick handler",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-rpc-contracts",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/Event.ts",
        contents: template("./server-http-rpc/src/Rpc/Event.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
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
    id: "server-http-api-todos",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Todo HTTP API",
    description: "Persistent Todo CRUD endpoints over Effect HTTP API",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: serverApiTarget,
        moduleId: "server-http-api",
      },
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-todo-http-contracts",
      },
      {
        _tag: "required-module",
        target: dbTarget,
        moduleId: "package-db-todo-repository",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Api/Todo.ts",
        contents: template("./server-http-api-todos/src/Api/Todo.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/db",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "TodoApiLive",
        import: {
          moduleSpecifier: "./Api/Todo",
          namedImports: ["TodoApiLive"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "RouterDependencies",
        functionName: "Layer.mergeAll",
        argument:
          "TodoRepositoryLive.pipe(Layer.provide(DatabaseLive), Layer.satisfiesServicesType<never>())",
        import: {
          moduleSpecifier: "@repo/db",
          namedImports: ["DatabaseLive", "TodoRepositoryLive"],
        },
      },
    ],
  },
  {
    id: "server-http-rpc-todos",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Todo HTTP RPC",
    description: "Persistent Todo CRUD operations on the shared HTTP RPC route",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: serverApiTarget,
        moduleId: "server-http-rpc",
      },
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-todo-rpc-contracts",
      },
      {
        _tag: "required-module",
        target: dbTarget,
        moduleId: "package-db-todo-repository",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/Todo.ts",
        contents: template("./server-http-rpc-todos/src/Rpc/Todo.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/db",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/Rpc/Event.ts",
        targetVariable: "RpcHandlers",
        functionName: "Layer.mergeAll",
        argument: "TodoRpcHandlers",
        import: {
          moduleSpecifier: "./Todo",
          namedImports: ["TodoRpcHandlers"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "RouterDependencies",
        functionName: "Layer.mergeAll",
        argument:
          "TodoRepositoryLive.pipe(Layer.provide(DatabaseLive), Layer.satisfiesServicesType<never>())",
        import: {
          moduleSpecifier: "@repo/db",
          namedImports: ["DatabaseLive", "TodoRepositoryLive"],
        },
      },
    ],
  },
  {
    id: "server-chat-rpc",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Chat Server",
    description: "AI chat RPC handler with tool support",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-chat-contracts",
      },
      {
        _tag: "required-module",
        target: aiTarget,
        moduleId: "package-ai-chat-service",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/Chat.ts",
        contents: template("./server-chat-rpc/src/Rpc/Chat.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/runtime/ChatSessions.ts",
        contents: template("./server-chat-rpc/src/runtime/ChatSessions.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/runtime/ChatRuntime.ts",
        contents: template("./server-chat-rpc/src/runtime/ChatRuntime.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/ai",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
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
    nextSteps: [
      "Chat Server: Set `ANTHROPIC_API_KEY` in the `{{targetPath}}` runtime environment before using chat RPCs.",
    ],
  },
  {
    id: "server-chat-runtime-managed",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Managed Chat Runtime",
    description: "In-memory managed chat send, watch, and interrupt runtime",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-chat-managed-contracts",
      },
      {
        _tag: "required-module",
        target: {
          kind: "server",
          name: "api",
        },
        moduleId: "server-chat-rpc",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/ChatManaged.ts",
        contents: template(
          "./server-chat-runtime-managed/src/Rpc/ChatManaged.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/runtime/ChatManagedRuntime.ts",
        contents: template(
          "./server-chat-runtime-managed/src/runtime/ChatManagedRuntime.ts",
        ),
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
    id: "server-ws-presence",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "WebSocket Presence Server",
    description: "Real-time presence tracking over WebSocket RPC",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-ws-contracts",
      },
      {
        _tag: "required-module",
        target: presenceTarget,
        moduleId: "package-presence-service",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Rpc/Presence.ts",
        contents: template("./server-ws-presence/src/Rpc/Presence.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/presence",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
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
    id: "server-devtools",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Effect DevTools Server",
    description: "Optional Effect DevTools tracer layer for server apps",
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/observability/DevTools.ts",
        contents: template("./server-devtools/src/observability/DevTools.ts"),
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
]);
