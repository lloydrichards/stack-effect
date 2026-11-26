import { defineModules } from "@repo/authoring/Define";
import { templates } from "@repo/authoring/Template";
import { EFFECT_VERSION } from "@repo/catalog-official/dependencies";

const template = templates(
  new URL("../templates/server-slack-bot/", import.meta.url),
);

export const slackBot = defineModules(import.meta.url, [
  {
    id: "server-slack-bot",
    title: "Slack Bot",
    description: "Reply in a Slack thread when someone mentions the bot",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [],
    contributions: [
      ...[
        "SLACK.md",
        "src/webhooks/slack.ts",
        "src/fixtures/slack-mention.ts",
      ].map((path) => ({
        _tag: "file" as const,
        path: `{{targetPath}}/${path}`,
        contents: template(`./${path}`),
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
        field: "scripts",
        name: "fixture:slack",
        value:
          "{{#if runtime=bun}}bun{{/if}}{{#if runtime=node}}tsx{{/if}}{{#if runtime=deno}}deno run{{/if}} src/fixtures/slack-mention.ts",
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
      "See `{{targetPath}}/SLACK.md` to exercise the webhook locally and connect a Slack app.",
    ],
  },
]);
