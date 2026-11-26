import { defineModules, type CatalogInput } from "@repo/authoring/Define";
import { templates } from "@repo/authoring/Template";
import { clusterCounter } from "./cluster-counter";
import { counterClients } from "./cluster-counter-clients";
import { discordInteractions } from "./discord-interactions";
import { experiments } from "./experiments";
import { githubIssueWebhook } from "./github-issue-webhook";
import { graphqlClient } from "./graphql-client";
import { graphqlQuery } from "./graphql-query";
import { receiptApp } from "./receipt-app";
import { receiptWorkflow } from "./receipt-workflow";
import { slackBot } from "./slack-bot";
const template = templates(new URL("../templates/", import.meta.url));
const domain = { kind: "package", name: "domain" };

const persistedQueue = defineModules(import.meta.url, [
  {
    id: "domain-summary-job",
    title: "Text Summary Job",
    description: "Shared payload and result for the persisted queue example",
    visibility: "internal",
    supportedRuntimes: ["bun"],
    supportedOn: [{ _tag: "identity", identity: domain }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/SummaryJob.ts",
        contents: template("./domain-summary-job/src/SummaryJob.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./SummaryJob",
        value: "./src/SummaryJob.ts",
      },
    ],
  },
  {
    id: "cli-persisted-queue",
    title: "Persisted Queue",
    description:
      "Enqueue and consume a text summary in separate CLI processes using SQLite",
    supportedRuntimes: ["bun"],
    supportedOn: [{ _tag: "kind", kind: "cli" }],
    dependencies: [
      {
        _tag: "required-module",
        target: domain,
        moduleId: "domain-summary-job",
      },
      {
        _tag: "required-module",
        target: { kind: "package", name: "db" },
        moduleId: "package-db-sqlite",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/commands/queue.ts",
        contents: template("./cli-persisted-queue/src/commands/queue.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/jobs/SummaryQueue.ts",
        contents: template("./cli-persisted-queue/src/jobs/SummaryQueue.ts"),
      },
      ...["enqueue", "consumeOnce"].map((command) => ({
        _tag: "ts-call-arg" as const,
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllCommands",
        functionName: "Command.withSubcommands",
        argument: command,
        import: {
          moduleSpecifier: "./commands/queue",
          namedImports: [command],
        },
      })),
      ...["@repo/db", "@repo/domain"].map((name) => ({
        _tag: "pkg-json-entry" as const,
        path: "{{targetPath}}/package.json",
        field: "dependencies" as const,
        name,
        value: "{{workspaceDependency}}",
      })),
    ],
    nextSteps: [
      'Persisted Queue: From the workspace root, run `bun {{targetPath}}/src/index.ts enqueue --id demo-1 "Effect queues persist jobs"`, then `bun {{targetPath}}/src/index.ts consume-once`. Both use the same SQLite file. The consumer waits for a job if the queue is empty.',
    ],
  },
]);

export const labsCatalog: CatalogInput = {
  targets: [],
  modules: [
    persistedQueue,
    experiments,
    graphqlQuery,
    graphqlClient,
    clusterCounter,
    counterClients,
    receiptWorkflow,
    receiptApp,
    discordInteractions,
    githubIssueWebhook,
    slackBot,
  ],
};
export const labsCatalogRoot = new URL("../", import.meta.url);
export const LABS_CATALOG_ID = "stack-effect-labs";
