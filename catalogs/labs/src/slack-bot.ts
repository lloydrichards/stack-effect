import { defineModules } from "@repo/authoring/Define";
import { templates } from "@repo/authoring/Template";
import { EFFECT_VERSION } from "@repo/catalog-official/dependencies";

const template = templates(new URL("../templates/", import.meta.url));

const chatBot = { kind: "package", name: "chat-bot" };

export const slackBot = defineModules(import.meta.url, [
  {
    id: "package-chat-bot",
    title: "Chat Bot",
    description: "Bot replies shared by messaging integrations",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: chatBot }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Bot.ts",
        contents: template("./package-chat-bot/src/Bot.ts"),
        conflictOnModify: true,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./Bot",
        value: "./src/Bot.ts",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "effect",
        value: EFFECT_VERSION,
      },
    ],
  },
  {
    id: "server-slack-bot",
    title: "Slack Integration",
    description: "Connect the Chat Bot to Slack’s Events API",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [
      {
        _tag: "required-module",
        target: chatBot,
        moduleId: "package-chat-bot",
      },
    ],
    contributions: [
      ...[
        "SLACK.md",
        "src/webhooks/slack.ts",
        "slack-app.yml",
        ".env.slack.example",
      ].map((path) => ({
        _tag: "file" as const,
        path: `{{targetPath}}/${path}`,
        contents: template(`./server-slack-bot/${path}`),
      })),
      ...["effect", "@effect/chat-slack"].map((name) => ({
        _tag: "pkg-json-entry" as const,
        path: "{{targetPath}}/package.json",
        field: "dependencies" as const,
        name,
        value: EFFECT_VERSION,
      })),
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/chat-bot",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "SlackBotRoutes",
        import: {
          moduleSpecifier: "./webhooks/slack",
          namedImports: ["SlackBotRoutes"],
        },
      },
    ],
    nextSteps: [
      "See `{{targetPath}}/SLACK.md` to install your Slack app and try a threaded reply.",
    ],
  },
]);
