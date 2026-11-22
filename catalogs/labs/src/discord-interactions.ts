import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));

const httpApi = {
  _tag: "required-module",
  target: { kind: "server", name: "api" },
  moduleId: "server-http-api",
} as const;

const files = (moduleId: string, paths: ReadonlyArray<string>) =>
  paths.map((path) => ({
    _tag: "file" as const,
    path: `{{targetPath}}/${path}`,
    contents: template(`./${moduleId}/${path}`),
  }));

const serverLayer = (
  targetVariable: "AllRouters",
  argument: string,
  moduleSpecifier: string,
) => ({
  _tag: "ts-call-arg" as const,
  path: "{{targetPath}}/src/index.ts",
  targetVariable,
  functionName: "Layer.mergeAll",
  argument,
  import: { moduleSpecifier, namedImports: [argument] },
});

export const discordInteractions = defineModules(import.meta.url, [
  {
    id: "server-discord-interactions",
    title: "Discord Interaction Webhook",
    description:
      "Verify a signed Discord interaction and answer a protocol PING",
    supportedRuntimes: ["bun"],
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [httpApi],
    contributions: [
      ...files("server-discord-interactions", [
        "DISCORD.md",
        "src/webhooks/discord.ts",
        "src/webhooks/discord.test.ts",
      ]),
      serverLayer("AllRouters", "DiscordInteractions", "./webhooks/discord"),
    ],
    nextSteps: [
      "See `{{targetPath}}/DISCORD.md` to exercise the signed PING with fixture keys.",
    ],
  },
]);
