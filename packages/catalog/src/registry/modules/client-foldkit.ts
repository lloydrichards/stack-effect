import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
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

const foldkitKind = TargetKind.make("client-foldkit");
const domainTarget = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "domain",
});

/**
 * Helper to generate the update case body for a foldkit child feature module.
 */
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

/**
 * Client Foldkit modules - TEA-based frontend features
 */
export const clientFoldkitModules: ReadonlyArray<typeof ModuleDefinition.Type> =
  [
    {
      id: ModuleId.make("client-foldkit-http-api"),
      title: "HTTP API Client (Foldkit)",
      description: "REST API client with Command pattern for Foldkit",
      supportedOn: [{ _tag: "kind", kind: foldkitKind }],
      dependencies: [
        {
          _tag: "required-module",
          target: domainTarget,
          moduleId: ModuleId.make("domain-api-contracts"),
        },
      ],
      implies: [
        {
          targetKind: TargetKind.make("server"),
          moduleId: ModuleId.make("server-http-api"),
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
          value: "workspace:*",
        },
        // Model composition
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
        // Message composition
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
        // Update composition
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
        // Init composition
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
        // View composition
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
      id: ModuleId.make("client-foldkit-http-rpc"),
      title: "HTTP RPC Client (Foldkit)",
      description: "RPC streaming client with Subscription pattern for Foldkit",
      supportedOn: [{ _tag: "kind", kind: foldkitKind }],
      dependencies: [
        {
          _tag: "required-module",
          target: domainTarget,
          moduleId: ModuleId.make("domain-rpc-contracts"),
        },
      ],
      implies: [
        {
          targetKind: TargetKind.make("server"),
          moduleId: ModuleId.make("server-http-rpc"),
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
          value: "workspace:*",
        },
        // Model composition
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
        // Message composition
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
        // Update composition
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
        // Init composition
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
        // Subscription composition
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
        // View composition
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
      id: ModuleId.make("client-foldkit-ws-presence"),
      title: "WebSocket Presence (Foldkit)",
      description: "Real-time presence UI with WebSocket RPC for Foldkit",
      supportedOn: [{ _tag: "kind", kind: foldkitKind }],
      dependencies: [
        {
          _tag: "required-module",
          target: domainTarget,
          moduleId: ModuleId.make("domain-ws-contracts"),
        },
      ],
      implies: [
        {
          targetKind: TargetKind.make("server"),
          moduleId: ModuleId.make("server-ws-presence"),
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
          value: "workspace:*",
        },
        // Model composition
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
        // Message composition
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
        // Update composition
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
        // Init composition
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
        // Subscription composition
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
        // View composition
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
      id: ModuleId.make("client-foldkit-chat"),
      title: "Chat Client (Foldkit)",
      description: "AI chat UI with streaming and tool calls for Foldkit",
      supportedOn: [{ _tag: "kind", kind: foldkitKind }],
      dependencies: [
        {
          _tag: "required-module",
          target: domainTarget,
          moduleId: ModuleId.make("domain-chat-contracts"),
        },
        {
          _tag: "required-module",
          target: domainTarget,
          moduleId: ModuleId.make("domain-rpc-contracts"),
        },
      ],
      implies: [
        {
          targetKind: TargetKind.make("server"),
          moduleId: ModuleId.make("server-chat-rpc"),
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
          value: "workspace:*",
        },
        // Model composition
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
        // Message composition
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
        // Update composition
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
        // Init composition
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
        // Subscription composition
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
        // View composition
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
  ];
