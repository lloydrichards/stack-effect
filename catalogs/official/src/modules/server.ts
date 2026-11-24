import { defineModules } from "@repo/authoring/Define";
import { templates } from "@repo/authoring/Template";
import { chatMcpChildren } from "./chat-mcp";

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

const todoRepositoryWiring = [
  {
    _tag: "file",
    path: "{{targetPath}}/src/services/TodoRepository.ts",
    contents: template(
      "./server-todo-repository/src/Services/TodoRepository.ts",
    ),
  },
  {
    _tag: "ts-call-arg",
    path: "{{targetPath}}/src/index.ts",
    targetVariable: "RouterDependencies",
    functionName: "Layer.mergeAll",
    argument: "TodoRepositoryLayer",
    import: {
      moduleSpecifier: "./services/TodoRepository",
      namedImports: ["TodoRepositoryLayer"],
    },
  },
] as const;

export const serverModules = defineModules(import.meta.url, [
  {
    id: "server-sqlite-dev-permission",
    title: "SQLite FFI Permission (Deno)",
    description: "Enable SQLite FFI access in generated Deno server scripts",
    visibility: "internal",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: serverKind }],
    dependencies: [],
    contributions: [],
  },
  {
    id: "server-http-api",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "HTTP API Endpoints",
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
        path: "{{targetPath}}/src/api/Health.ts",
        contents: template("./server-http-api/src/Api/Health.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/api/Hello.ts",
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
    title: "HTTP RPC Streaming Handler",
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
        path: "{{targetPath}}/src/rpc/Event.ts",
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
        argument: "EventRpcRoutes",
        import: {
          moduleSpecifier: "./rpc/Event",
          namedImports: ["EventRpcRoutes"],
        },
      },
    ],
  },
  {
    id: "server-http-api-todos",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Todo Endpoints (HTTP API)",
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
        path: "{{targetPath}}/src/api/Todo.ts",
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
        argument: "TodoRoutes",
        import: {
          moduleSpecifier: "./api/Todo",
          namedImports: ["TodoRoutes"],
        },
      },
      ...todoRepositoryWiring,
    ],
  },
  {
    id: "server-http-rpc-todos",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Todo Operations (HTTP RPC)",
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
        path: "{{targetPath}}/src/rpc/Todo.ts",
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
        path: "{{targetPath}}/src/rpc/Event.ts",
        targetVariable: "RpcHandlers",
        functionName: "Layer.mergeAll",
        argument: "TodoRpcHandlers",
        import: {
          moduleSpecifier: "./Todo",
          namedImports: ["TodoRpcHandlers"],
        },
      },
      ...todoRepositoryWiring,
    ],
  },
  {
    id: "server-chat-rpc",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "AI Chat Handler",
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
    children: chatMcpChildren("server"),
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/rpc/Chat.ts",
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
        argument: "ChatRpcRoutes",
        import: {
          moduleSpecifier: "./rpc/Chat",
          namedImports: ["ChatRpcRoutes"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "RouterDependencies",
        functionName: "Layer.mergeAll",
        argument: "ChatSessions.layer",
        import: {
          moduleSpecifier: "./runtime/ChatSessions",
          namedImports: ["ChatSessions"],
        },
      },
    ],
    nextSteps: [
      "Chat Server: Set `ANTHROPIC_API_KEY` in the `{{targetPath}}` runtime environment before using chat RPCs.",
    ],
  },
  {
    id: "server-ws-presence",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "WebSocket Presence Handler",
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
        path: "{{targetPath}}/src/rpc/Presence.ts",
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
        argument: "PresenceRpcRoutes",
        import: {
          moduleSpecifier: "./rpc/Presence",
          namedImports: ["PresenceRpcRoutes"],
        },
      },
    ],
  },
  {
    id: "server-devtools",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Effect DevTools",
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
        argument: "DevToolsLayer",
        import: {
          moduleSpecifier: "./observability/DevTools",
          namedImports: ["DevToolsLayer"],
        },
      },
    ],
  },
]);
