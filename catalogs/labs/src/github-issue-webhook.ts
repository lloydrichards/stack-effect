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
  targetVariable: "AllRouters" | "RouterDependencies",
  argument: string,
  moduleSpecifier: string,
  importName = argument,
) => ({
  _tag: "ts-call-arg" as const,
  path: "{{targetPath}}/src/index.ts",
  targetVariable,
  functionName: "Layer.mergeAll",
  argument,
  import: { moduleSpecifier, namedImports: [importName] },
});

export const githubIssueWebhook = defineModules(import.meta.url, [
  {
    id: "domain-github-issue-webhook",
    title: "GitHub Issue Event",
    description: "GitHub issue delivery and label decision contracts",
    visibility: "internal",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: domain }],
    dependencies: [],
    contributions: [
      ...files("domain-github-issue-webhook", ["src/GitHubIssueEvent.ts"]),
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./GitHubIssueEvent",
        value: "./src/GitHubIssueEvent.ts",
      },
    ],
  },
  {
    id: "server-github-issue-label",
    title: "GitHub Issue Label Webhook",
    description:
      "Verify a signed issue delivery and apply one allowlisted label through an injected client",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [
      httpApi,
      {
        _tag: "required-module",
        target: domain,
        moduleId: "domain-github-issue-webhook",
      },
    ],
    contributions: [
      ...files("server-github-issue-label", [
        "GITHUB-WEBHOOK.md",
        "src/webhooks/github.ts",
        "src/webhooks/issue-label.ts",
        "src/fixtures/github-issue.ts",
      ]),
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "fixture:github",
        value:
          "{{#if runtime=bun}}bun{{/if}}{{#if runtime=node}}tsx{{/if}}{{#if runtime=deno}}deno run{{/if}} src/fixtures/github-issue.ts",
      },
      serverLayer("AllRouters", "GitHubIssueWebhook", "./webhooks/github"),
      serverLayer(
        "RouterDependencies",
        "GitHubLabels.layerDemo",
        "./webhooks/issue-label",
        "GitHubLabels",
      ),
    ],
    nextSteps: [
      "See `{{targetPath}}/GITHUB-WEBHOOK.md` for the signed fixture and the fake label client.",
    ],
  },
]);
