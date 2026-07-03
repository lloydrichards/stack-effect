import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  cliAskCommandContents,
  cliChatDriverContents,
  cliHelloCommandContents,
  cliTerminalChatCommandContents,
  cliTerminalChatContents,
} from "../content/cli";

/**
 * CLI modules - subcommands and services for CLI applications
 */
export const cliModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("cli-command-hello"),
    title: "Hello Command",
    description: "A simple hello-world subcommand for the CLI",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("cli") }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/commands/hello.ts",
        contents: cliHelloCommandContents,
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllCommands",
        functionName: "Command.withSubcommands",
        argument: "hello",
        import: {
          moduleSpecifier: "./commands/hello",
          namedImports: ["hello"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("cli-chat-driver"),
    title: "Chat CLI Driver",
    description: "Shared direct-AI chat plumbing for CLI chat commands",
    visibility: "internal",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("cli") }],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
        moduleId: ModuleId.make("domain-chat-contracts"),
      },
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "ai",
        }),
        moduleId: ModuleId.make("package-ai-chat-service"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/chat/ChatDriver.ts",
        contents: cliChatDriverContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/ai",
        value: "workspace:*",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "workspace:*",
      },
    ],
  },
  {
    id: ModuleId.make("cli-command-chat-ask"),
    title: "Ask Command",
    description: "One-shot AI ask command for CLI applications",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("cli") }],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("cli"),
          name: "app",
        }),
        moduleId: ModuleId.make("cli-chat-driver"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/commands/ask.ts",
        contents: cliAskCommandContents,
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllCommands",
        functionName: "Command.withSubcommands",
        argument: "ask",
        import: {
          moduleSpecifier: "./commands/ask",
          namedImports: ["ask"],
        },
      },
    ],
  },
  {
    id: ModuleId.make("cli-command-chat-terminal"),
    title: "Terminal Chat Command",
    description: "Interactive terminal AI chat command for CLI applications",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("cli") }],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("cli"),
          name: "app",
        }),
        moduleId: ModuleId.make("cli-chat-driver"),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/commands/chat.ts",
        contents: cliTerminalChatCommandContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/chat/TerminalChat.ts",
        contents: cliTerminalChatContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "effect-boxes",
        value: "^0.16.1",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllCommands",
        functionName: "Command.withSubcommands",
        argument: "chat",
        import: {
          moduleSpecifier: "./commands/chat",
          namedImports: ["chat"],
        },
      },
    ],
  },
];
