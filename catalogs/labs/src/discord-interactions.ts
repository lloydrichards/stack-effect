import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));

const domain = { kind: "package", name: "domain" };

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
    id: "domain-discord-interactions",
    title: "Discord Interaction",
    description: "Discord PING and PONG contracts",
    visibility: "internal",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: domain }],
    dependencies: [],
    contributions: [
      ...files("domain-discord-interactions", ["src/DiscordInteraction.ts"]),
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./DiscordInteraction",
        value: "./src/DiscordInteraction.ts",
      },
    ],
  },
  {
    id: "server-discord-interactions",
    title: "Discord Interaction Webhook",
    description:
      "Verify a signed Discord interaction and answer a protocol PING",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [
      httpApi,
      {
        _tag: "required-module",
        target: domain,
        moduleId: "domain-discord-interactions",
      },
    ],
    contributions: [
      ...files("server-discord-interactions", [
        "DISCORD.md",
        "src/webhooks/discord.ts",
      ]),
      serverLayer("AllRouters", "DiscordInteractions", "./webhooks/discord"),
    ],
    nextSteps: [
      "See `{{targetPath}}/DISCORD.md` to exercise the signed PING with fixture keys.",
    ],
  },
]);
