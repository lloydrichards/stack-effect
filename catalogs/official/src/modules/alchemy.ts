import {
  type ContributionInput,
  defineModules,
  templates,
} from "@repo/authoring";

const template = templates(
  new URL("../../templates/alchemy/", import.meta.url),
);
const workspace = { kind: "workspace", name: "root" };
const file = (path: string, source: string): ContributionInput => ({
  _tag: "file",
  path,
  contents: template(source),
  conflictOnModify: true,
});
const entry = (
  field: "scripts" | "devDependencies" | "dependencies",
  name: string,
  value: string,
): ContributionInput => ({
  _tag: "pkg-json-entry",
  path: "{{targetPath}}/package.json",
  field,
  name,
  value,
});
const root = {
  _tag: "required-module" as const,
  target: workspace,
  moduleId: "alchemy-cloudflare",
};

export const alchemyModules = defineModules(import.meta.url, [
  {
    id: "alchemy-cloudflare",
    title: "Alchemy Cloudflare",
    description: "Editable root Stack and Cloudflare deployment commands",
    supportedOn: [{ _tag: "identity", identity: workspace }],
    supportedRuntimes: ["bun", "node"],
    categories: ["deployment"],
    dependencies: [],
    contributions: [
      file("{{targetPath}}/alchemy.run.ts", "./workspace/alchemy.run.ts"),
      file(
        "{{targetPath}}/tsconfig.infra.json",
        "./workspace/tsconfig.infra.json",
      ),
      file("{{targetPath}}/.alchemy/.gitignore", "./workspace/_gitignore"),
      entry("devDependencies", "alchemy", "2.0.0-beta.81"),
      entry(
        "devDependencies",
        "@alchemy.run/frontend-frameworks",
        "2.0.0-beta.81",
      ),
      entry("devDependencies", "effect", "4.0.6"),
      entry(
        "devDependencies",
        "{{#if runtime=bun}}@effect/platform-bun{{/if}}{{#if runtime=node}}@effect/platform-node{{/if}}",
        "4.0.6",
      ),
      entry("devDependencies", "@types/node", "^26.6.3"),
      entry("scripts", "infra:check", "tsc -p tsconfig.infra.json --noEmit"),
      ...["plan", "dev", "deploy", "destroy"].map((command) =>
        entry("scripts", `infra:${command}`, `alchemy ${command} --stage dev`),
      ),
    ],
    nextSteps: [
      "Alchemy: import your target declarations and compose resources in alchemy.run.ts, then run infra:check and infra:dev. The root starts with no registered resources. Cloudflare plan/deploy/destroy require a configured profile and may create account resources.",
    ],
  },
  {
    id: "alchemy-worker-deployment",
    title: "Alchemy Worker deployment",
    description: "Deploy the target's Effect HTTP API through Cloudflare",
    supportedOn: [{ _tag: "kind", kind: "cloudflare-worker" }],
    supportedRuntimes: ["bun", "node"],
    dependencies: [root],
    contributions: [
      entry("dependencies", "alchemy", "2.0.0-beta.81"),
      file("{{targetPath}}/alchemy.ts", "./cloudflare-worker/alchemy.ts"),
    ],
  },
  ...(["client-foldkit", "client-react"] as const).map((kind) => ({
    id: `alchemy-${kind}-website`,
    title: `${kind === "client-foldkit" ? "Foldkit" : "React"} Alchemy Website`,
    description:
      "Cloudflare Website declaration with application environment inputs",
    supportedOn: [{ _tag: "kind" as const, kind }],
    supportedRuntimes: ["bun" as const, "node" as const],
    dependencies: [root],
    contributions: [file("{{targetPath}}/alchemy.ts", `./${kind}/alchemy.ts`)],
  })),
]);
