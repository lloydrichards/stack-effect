import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { clientDevToolsContents } from "../content/client";
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

const clientReactKind = TargetKind.make("client-react");
const serverKind = TargetKind.make("server");
const domainTarget = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "domain",
});

export const clientModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("client-react-http-api"),
    title: "HTTP API Client",
    description: "REST API client with Effect Atom and typed HttpApiClient",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-api-contracts"),
      },
    ],
    implies: [
      {
        targetKind: serverKind,
        moduleId: ModuleId.make("server-http-api"),
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
    scripts: [
      {
        label: "Install shadcn button component",
        command: "bunx shadcn@latest add button --yes --overwrite",
      },
      {
        label: "Install shadcn card component",
        command: "bunx shadcn@latest add card --yes --overwrite",
      },
    ],
  },
  {
    id: ModuleId.make("client-react-http-rpc"),
    title: "HTTP RPC Client",
    description: "RPC streaming client with tick atom and UI",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-rpc-contracts"),
      },
    ],
    implies: [
      {
        targetKind: serverKind,
        moduleId: ModuleId.make("server-http-rpc"),
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
    scripts: [
      {
        label: "Install shadcn button component",
        command: "bunx shadcn@latest add button --yes --overwrite",
      },
      {
        label: "Install shadcn card component",
        command: "bunx shadcn@latest add card --yes --overwrite",
      },
    ],
  },
  {
    id: ModuleId.make("client-react-chat"),
    title: "Chat Client",
    description: "AI chat UI with streaming, tool calls, and state machine",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-chat-contracts"),
      },
    ],
    implies: [
      {
        targetKind: serverKind,
        moduleId: ModuleId.make("server-chat-rpc"),
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
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@effect/platform-browser",
        value: "4.0.0-beta.98",
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
          "bunx shadcn@latest add message-scroller message bubble attachment marker --yes --overwrite",
      },
    ],
  },
  {
    id: ModuleId.make("client-react-ws-presence"),
    title: "WebSocket Presence Client",
    description: "Real-time presence UI with WebSocket RPC",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: ModuleId.make("domain-ws-contracts"),
      },
    ],
    implies: [
      {
        targetKind: serverKind,
        moduleId: ModuleId.make("server-ws-presence"),
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
        value: "4.0.0-beta.98",
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
    scripts: [
      {
        label: "Install shadcn button component",
        command: "bunx shadcn@latest add button --yes --overwrite",
      },
      {
        label: "Install shadcn card component",
        command: "bunx shadcn@latest add card --yes --overwrite",
      },
    ],
  },
  {
    id: ModuleId.make("client-react-devtools"),
    title: "Effect DevTools React Client",
    description: "Optional Effect DevTools tracer layer for React atom runtime",
    supportedOn: [{ _tag: "kind", kind: clientReactKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/devtools.ts",
        contents: clientDevToolsContents,
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
];
