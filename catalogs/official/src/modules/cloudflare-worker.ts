import { defineModules, templates } from "@repo/authoring";

const template = templates(
  new URL("../../templates/cloudflare-worker/", import.meta.url),
);

export const cloudflareWorkerModules = defineModules(import.meta.url, [
  {
    id: "cloudflare-worker-http",
    title: "Effect HTTP Worker",
    description:
      "Public health and hello endpoints using the shared domain API",
    provides: ["effect-http-api"],
    supportedRuntimes: ["bun", "node"],
    supportedOn: [{ _tag: "kind", kind: "cloudflare-worker" }],
    dependencies: [
      {
        _tag: "required-module",
        target: { kind: "package", name: "domain" },
        moduleId: "domain-api-contracts",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Api.ts",
        contents: template("./src/Api.ts"),
      },
    ],
  },
]);
