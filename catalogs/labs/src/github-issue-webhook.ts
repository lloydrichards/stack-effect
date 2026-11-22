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
  targetVariable: "AllRouters" | "RouterDependencies",
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

export const githubIssueWebhook = defineModules(import.meta.url, [
  {
    id: "server-github-issue-label",
    title: "GitHub Issue Label Webhook",
    description:
      "Verify a signed issue delivery and apply one allowlisted label through an injected client",
    supportedRuntimes: ["bun"],
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [httpApi],
    contributions: [
      ...files("server-github-issue-label", [
        "GITHUB-WEBHOOK.md",
        "src/webhooks/github.ts",
        "src/webhooks/github.test.ts",
        "src/webhooks/issue-label.ts",
      ]),
      serverLayer("AllRouters", "GitHubIssueWebhook", "./webhooks/github"),
      serverLayer(
        "RouterDependencies",
        "GitHubLabelsDemo",
        "./webhooks/issue-label",
      ),
    ],
    nextSteps: [
      "See `{{targetPath}}/GITHUB-WEBHOOK.md` for the signed fixture and the fake label client.",
    ],
  },
]);
