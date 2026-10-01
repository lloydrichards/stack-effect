import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../../templates/", import.meta.url));

const clientReactKind = "client-react";
const serverKind = "server";
const domainTarget = {
  kind: "package",
  name: "domain",
};

export const clientModules = defineModules(import.meta.url, [
  {
    id: "client-react-web-worker",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Browser Web Worker",
    description:
      "Browser Worker RPC with Effect Schema, Stream, Schedule, and Atom RPC",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/workers/import-validation/domain.ts",
        contents: template(
          "./client-react-web-worker/src/workers/import-validation/domain.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/workers/import-validation/import-validation.worker.ts",
        contents: template(
          "./client-react-web-worker/src/workers/import-validation/import-validation.worker.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/import-validation-worker.ts",
        contents: template(
          "./client-react-web-worker/src/lib/import-validation-worker.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/import-validation-card.tsx",
        contents: template(
          "./client-react-web-worker/src/components/import-validation-card.tsx",
        ),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@effect/platform-browser",
        value: "4.0.0",
      },
      {
        _tag: "jsx-slot",
        path: "{{targetPath}}/src/app.tsx",
        slotId: "components",
        content: "<ImportValidationCard />",
        import: {
          moduleSpecifier: "./components/import-validation-card",
          namedImports: ["ImportValidationCard"],
        },
      },
    ],
  },
  {
    id: "client-react-http-api",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "HTTP API Client",
    description: "REST API client with Effect Atom and typed HttpApiClient",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-api-contracts",
      },
    ],
    implies: [
      {
        targetKind: serverKind,
        moduleId: "server-http-api",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/atoms/hello-atom.ts",
        contents: template(
          "./client-react-http-api/src/lib/atoms/hello-atom.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/rest-card.tsx",
        contents: template(
          "./client-react-http-api/src/components/rest-card.tsx",
        ),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "jsx-slot",
        path: "{{targetPath}}/src/app.tsx",
        slotId: "components",
        content: "<RestCard />",
        import: {
          moduleSpecifier: "./components/rest-card",
          namedImports: ["RestCard"],
        },
      },
    ],
  },
  {
    id: "client-react-http-api-todos",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Todo HTTP Client",
    description: "Persistent Todo CRUD card backed by the typed HTTP API",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-todo-http-contracts",
      },
    ],
    implies: [
      {
        targetKind: serverKind,
        moduleId: "server-http-api-todos",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/atoms/todo-atom.ts",
        contents: template(
          "./client-react-http-api-todos/src/lib/atoms/todo-atom.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/todo-card.tsx",
        contents: template(
          "./client-react-http-api-todos/src/components/todo-card.tsx",
        ),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "jsx-slot",
        path: "{{targetPath}}/src/app.tsx",
        slotId: "components",
        content: "<TodoCard />",
        import: {
          moduleSpecifier: "./components/todo-card",
          namedImports: ["TodoCard"],
        },
      },
    ],
    nextSteps: [
      "Todo app commands: see the Persistent Todo app example in the stack-effect README.",
    ],
  },
  {
    id: "client-react-http-rpc",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "HTTP RPC Client",
    description: "RPC streaming client with tick atom and UI",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-rpc-contracts",
      },
    ],
    implies: [
      {
        targetKind: serverKind,
        moduleId: "server-http-rpc",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/rpc-client.ts",
        contents: template("./client-react-http-rpc/src/lib/rpc-client.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/atoms/tick-atom.ts",
        contents: template(
          "./client-react-http-rpc/src/lib/atoms/tick-atom.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/rpc-card.tsx",
        contents: template(
          "./client-react-http-rpc/src/components/rpc-card.tsx",
        ),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "jsx-slot",
        path: "{{targetPath}}/src/app.tsx",
        slotId: "components",
        content: "<RpcCard />",
        import: {
          moduleSpecifier: "./components/rpc-card",
          namedImports: ["RpcCard"],
        },
      },
    ],
  },
  {
    id: "client-react-chat",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Chat Client",
    description: "AI chat UI with streaming, tool calls, and state machine",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-chat-contracts",
      },
    ],
    implies: [
      {
        targetKind: serverKind,
        moduleId: "server-chat-rpc",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/chat-rpc-client.ts",
        contents: template("./client-react-chat/src/lib/chat-rpc-client.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/atoms/chat-atom.ts",
        contents: template("./client-react-chat/src/lib/atoms/chat-atom.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/chat-box.tsx",
        contents: template("./client-react-chat/src/components/chat-box.tsx"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@effect/platform-browser",
        value: "4.0.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@shadcn/react",
        value: "^0.2.0",
      },
      {
        _tag: "jsx-slot",
        path: "{{targetPath}}/src/app.tsx",
        slotId: "components",
        content: "<ChatBox />",
        import: {
          moduleSpecifier: "./components/chat-box",
          namedImports: ["ChatBox"],
        },
      },
    ],
    scripts: [
      {
        label: "Install shadcn chat UI components",
        command:
          "{{#if runtime=deno}}deno run -A npm:shadcn@latest add message-scroller message bubble attachment marker --yes --overwrite{{/if}}{{#if runtime=bun}}bunx shadcn@latest add message-scroller message bubble attachment marker --yes --overwrite{{/if}}{{#if runtime=node}}bunx shadcn@latest add message-scroller message bubble attachment marker --yes --overwrite{{/if}}",
      },
    ],
  },
  {
    id: "client-react-ws-presence",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "WebSocket Presence Client",
    description: "Real-time presence UI with WebSocket RPC",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-ws-contracts",
      },
    ],
    implies: [
      {
        targetKind: serverKind,
        moduleId: "server-ws-presence",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/web-socket-client.ts",
        contents: template(
          "./client-react-ws-presence/src/lib/web-socket-client.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/presence-panel.tsx",
        contents: template(
          "./client-react-ws-presence/src/components/presence-panel.tsx",
        ),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@effect/platform-browser",
        value: "4.0.0",
      },
      {
        _tag: "jsx-slot",
        path: "{{targetPath}}/src/app.tsx",
        slotId: "components",
        content: `<PresencePanel className="h-full" />`,
        import: {
          moduleSpecifier: "./components/presence-panel",
          namedImports: ["PresencePanel"],
        },
      },
    ],
  },
  {
    id: "client-react-devtools",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Effect DevTools React Client",
    description: "Optional Effect DevTools tracer layer for React atom runtime",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/devtools.ts",
        contents: template("./client-react-devtools/src/lib/devtools.ts"),
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/lib/atom.ts",
        targetVariable: "RuntimeLayer",
        functionName: "Layer.mergeAll",
        argument: "DevToolsLive",
        import: {
          moduleSpecifier: "./devtools",
          namedImports: ["DevToolsLive"],
        },
      },
    ],
  },
]);
