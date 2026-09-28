import { defineModules } from "@repo/authoring";
import { foldkitDevToolsContents } from "../content/client-foldkit";
import { foldkitRestFeatureContents } from "../content/client-foldkit-api";
import {
  foldkitChatClientContents,
  foldkitChatFeatureContents,
} from "../content/client-foldkit-chat";
import {
  foldkitRpcClientContents,
  foldkitTicksFeatureContents,
} from "../content/client-foldkit-rpc";
import {
  foldkitPresenceFeatureContents,
  foldkitWsClientContents,
} from "../content/client-foldkit-websocket";

const foldkitKind = "client-foldkit";
const domainTarget = {
  kind: "package",
  name: "domain",
};

const updateCaseValue = (namespace: string, modelField: string) =>
  `({ message }) => {
  const [nextChild, cmds] = ${namespace}.update(model.${modelField}, message);
  const mappedCommands = cmds.map(
    Command.mapEffect(
      Effect.map((message) => ${namespace}.GotMessage({ message })),
    ),
  ) as ReadonlyArray<Command.Command<Message>>;
  return [{ ...model, ${modelField}: nextChild }, mappedCommands];
}`;

export const clientFoldkitModules = defineModules(import.meta.url, [
  {
    id: "client-foldkit-devtools",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Foldkit DevTools",
    description: "Optional Foldkit runtime devtools for message inspection",
    supportedOn: [{ _tag: "kind", kind: foldkitKind }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/devtools.ts",
        contents: foldkitDevToolsContents,
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/entry.ts",
        targetVariable: "program",
        functionName: "Runtime.makeProgram",
        field: "devTools",
        value: "devTools",
        import: {
          moduleSpecifier: "./devtools",
          namedImports: ["devTools"],
        },
      },
    ],
  },
  {
    id: "client-foldkit-http-api",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "HTTP API Client (Foldkit)",
    description: "REST API client with Command pattern for Foldkit",
    supportedOn: [{ _tag: "kind", kind: foldkitKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-api-contracts",
      },
    ],
    implies: [
      {
        targetKind: "server",
        moduleId: "server-http-api",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/features/rest.ts",
        contents: foldkitRestFeatureContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "Model",
        functionName: "S.Struct",
        field: "rest",
        value: "Rest.Model",
        import: {
          moduleSpecifier: "./features/rest",
          namespaceImport: "Rest",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "Message",
        functionName: "S.Union",
        argument: "Rest.GotMessage",
        import: {
          moduleSpecifier: "./features/rest",
          namespaceImport: "Rest",
        },
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "update",
        functionName: "M.tagsExhaustive",
        field: "GotRestMessage",
        value: updateCaseValue("Rest", "rest"),
        import: {
          moduleSpecifier: "./features/rest",
          namespaceImport: "Rest",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "init",
        functionName: "Init.compose",
        argument: `Init.child(Rest, "rest", Rest.GotMessage)`,
        import: {
          moduleSpecifier: "./features/rest",
          namespaceImport: "Rest",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "view",
        functionName: "Views.compose",
        argument: `Rest.view(model.rest, (msg) => Rest.GotMessage({ message: msg }))`,
        import: {
          moduleSpecifier: "./features/rest",
          namespaceImport: "Rest",
        },
      },
    ],
  },
  {
    id: "client-foldkit-http-rpc",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "HTTP RPC Client (Foldkit)",
    description: "RPC streaming client with Subscription pattern for Foldkit",
    supportedOn: [{ _tag: "kind", kind: foldkitKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-rpc-contracts",
      },
    ],
    implies: [
      {
        targetKind: "server",
        moduleId: "server-http-rpc",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/features/ticks.ts",
        contents: foldkitTicksFeatureContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/rpc-client.ts",
        contents: foldkitRpcClientContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "Model",
        functionName: "S.Struct",
        field: "ticks",
        value: "Ticks.Model",
        import: {
          moduleSpecifier: "./features/ticks",
          namespaceImport: "Ticks",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "Message",
        functionName: "S.Union",
        argument: "Ticks.GotMessage",
        import: {
          moduleSpecifier: "./features/ticks",
          namespaceImport: "Ticks",
        },
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "update",
        functionName: "M.tagsExhaustive",
        field: "GotTicksMessage",
        value: updateCaseValue("Ticks", "ticks"),
        import: {
          moduleSpecifier: "./features/ticks",
          namespaceImport: "Ticks",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "init",
        functionName: "Init.compose",
        argument: `Init.child(Ticks, "ticks", Ticks.GotMessage)`,
        import: {
          moduleSpecifier: "./features/ticks",
          namespaceImport: "Ticks",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "subscriptions",
        functionName: "Subscription.aggregate",
        argument: `Subscription.lift(Ticks.subscriptions)<Model, Message>({
    toChildModel: (model) => model.ticks,
    toParentMessage: (message) => Ticks.GotMessage({ message }),
  })`,
        import: {
          moduleSpecifier: "./features/ticks",
          namespaceImport: "Ticks",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "view",
        functionName: "Views.compose",
        argument: `Ticks.view(model.ticks, (msg) => Ticks.GotMessage({ message: msg }))`,
        import: {
          moduleSpecifier: "./features/ticks",
          namespaceImport: "Ticks",
        },
      },
    ],
  },
  {
    id: "client-foldkit-ws-presence",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "WebSocket Presence (Foldkit)",
    description: "Real-time presence UI with WebSocket RPC for Foldkit",
    supportedOn: [{ _tag: "kind", kind: foldkitKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-ws-contracts",
      },
    ],
    implies: [
      {
        targetKind: "server",
        moduleId: "server-ws-presence",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/features/presence.ts",
        contents: foldkitPresenceFeatureContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/ws-client.ts",
        contents: foldkitWsClientContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "Model",
        functionName: "S.Struct",
        field: "presence",
        value: "Presence.Model",
        import: {
          moduleSpecifier: "./features/presence",
          namespaceImport: "Presence",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "Message",
        functionName: "S.Union",
        argument: "Presence.GotMessage",
        import: {
          moduleSpecifier: "./features/presence",
          namespaceImport: "Presence",
        },
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "update",
        functionName: "M.tagsExhaustive",
        field: "GotPresenceMessage",
        value: updateCaseValue("Presence", "presence"),
        import: {
          moduleSpecifier: "./features/presence",
          namespaceImport: "Presence",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "init",
        functionName: "Init.compose",
        argument: `Init.child(Presence, "presence", Presence.GotMessage)`,
        import: {
          moduleSpecifier: "./features/presence",
          namespaceImport: "Presence",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "subscriptions",
        functionName: "Subscription.aggregate",
        argument: `Subscription.lift(Presence.subscriptions)<Model, Message>({
    toChildModel: (model) => model.presence,
    toParentMessage: (message) => Presence.GotMessage({ message }),
  })`,
        import: {
          moduleSpecifier: "./features/presence",
          namespaceImport: "Presence",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "view",
        functionName: "Views.compose",
        argument: `Presence.view(model.presence, (msg) => Presence.GotMessage({ message: msg }))`,
        import: {
          moduleSpecifier: "./features/presence",
          namespaceImport: "Presence",
        },
      },
    ],
  },
  {
    id: "client-foldkit-chat",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Chat Client (Foldkit)",
    description: "AI chat UI with streaming and tool calls for Foldkit",
    supportedOn: [{ _tag: "kind", kind: foldkitKind }],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-chat-contracts",
      },
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-rpc-contracts",
      },
    ],
    implies: [
      {
        targetKind: "server",
        moduleId: "server-chat-rpc",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/features/chat.ts",
        contents: foldkitChatFeatureContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/chat-client.ts",
        contents: foldkitChatClientContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/rpc-client.ts",
        contents: foldkitRpcClientContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "Model",
        functionName: "S.Struct",
        field: "chat",
        value: "Chat.Model",
        import: {
          moduleSpecifier: "./features/chat",
          namespaceImport: "Chat",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "Message",
        functionName: "S.Union",
        argument: "Chat.GotMessage",
        import: {
          moduleSpecifier: "./features/chat",
          namespaceImport: "Chat",
        },
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "update",
        functionName: "M.tagsExhaustive",
        field: "GotChatMessage",
        value: updateCaseValue("Chat", "chat"),
        import: {
          moduleSpecifier: "./features/chat",
          namespaceImport: "Chat",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "init",
        functionName: "Init.compose",
        argument: `Init.child(Chat, "chat", Chat.GotMessage)`,
        import: {
          moduleSpecifier: "./features/chat",
          namespaceImport: "Chat",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "subscriptions",
        functionName: "Subscription.aggregate",
        argument: `Subscription.lift(Chat.subscriptions)<Model, Message>({
    toChildModel: (model) => model.chat,
    toParentMessage: (message) => Chat.GotMessage({ message }),
  })`,
        import: {
          moduleSpecifier: "./features/chat",
          namespaceImport: "Chat",
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/main.ts",
        targetVariable: "view",
        functionName: "Views.compose",
        argument: `Chat.view(model.chat, (msg) => Chat.GotMessage({ message: msg }))`,
        import: {
          moduleSpecifier: "./features/chat",
          namespaceImport: "Chat",
        },
      },
    ],
  },
]);
