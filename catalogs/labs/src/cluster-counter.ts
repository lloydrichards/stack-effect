import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));
const domain = { kind: "package", name: "domain" };
const api = { kind: "server", name: "api" };
const counterContracts = {
  _tag: "required-module",
  target: domain,
  moduleId: "domain-counter-contracts",
} as const;

export const clusterCounter = defineModules(import.meta.url, [
  {
    id: "domain-counter-contracts",
    title: "Counter API Contracts",
    description: "Shared counter ID, response, and HTTP endpoint",
    visibility: "internal",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: domain }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Counter.ts",
        contents: template("./domain-counter-contracts/src/Counter.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/CounterApi.ts",
        contents: template("./domain-counter-contracts/src/CounterApi.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./Counter",
        value: "./src/Counter.ts",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./CounterApi",
        value: "./src/CounterApi.ts",
      },
    ],
  },
  {
    id: "server-cluster-counter",
    title: "Cluster Counter",
    description:
      "Host counters keyed by ID on a local Cluster runner in the HTTP server",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [
      {
        _tag: "required-module",
        target: api,
        moduleId: "server-http-api",
      },
      counterContracts,
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/CLUSTER.md",
        contents: template("./server-cluster-counter/CLUSTER.md"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/cluster/Counter.ts",
        contents: template("./server-cluster-counter/src/cluster/Counter.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/cluster/Runner.ts",
        contents: template("./server-cluster-counter/src/cluster/Runner.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/api/Counter.ts",
        contents: template("./server-cluster-counter/src/api/Counter.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "{{#if runtime=bun}}@effect/sql-sqlite-bun{{/if}}{{#if runtime=node}}@effect/sql-sqlite-node{{/if}}{{#if runtime=deno}}@effect/sql-sqlite-node{{/if}}",
        value: "4.1.4",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "{{#if runtime=deno}}counter:serve{{/if}}",
        value:
          "deno run --allow-env --allow-net --allow-read --allow-write --allow-ffi src/index.ts",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "CounterApiLive",
        import: {
          moduleSpecifier: "./api/Counter",
          namedImports: ["CounterApiLive"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "RouterDependencies",
        functionName: "Layer.mergeAll",
        argument: "ClusterLive",
        import: {
          moduleSpecifier: "./cluster/Runner",
          namedImports: ["ClusterLive"],
        },
      },
    ],
    nextSteps: [
      "Start the Cluster counter from `{{targetPath}}` with `{{#if runtime=deno}}deno task counter:serve{{/if}}{{#if runtime=bun}}bun run dev{{/if}}{{#if runtime=node}}{{runCommand}} dev{{/if}}` and send `POST /counters/a/increment` to the server port (9000 by default). See `{{targetPath}}/CLUSTER.md` for the runner, state lifetime, and extension points.",
    ],
  },
  {
    id: "cli-cluster-counter",
    title: "Cluster Counter Command",
    description: "Increment a counter by ID through the server's HTTP API",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "cli" }],
    dependencies: [
      counterContracts,
      {
        _tag: "required-module",
        target: api,
        moduleId: "server-cluster-counter",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/commands/counter.ts",
        contents: template("./cli-cluster-counter/src/commands/counter.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllCommands",
        functionName: "Command.withSubcommands",
        argument: "counter",
        import: {
          moduleSpecifier: "./commands/counter",
          namedImports: ["counter"],
        },
      },
    ],
    nextSteps: [
      "Start the API server, then run the CLI with `counter a` twice and `counter b` once. See the server's `CLUSTER.md` for the commands. The counts are 1, 2, and 1 on a fresh server. Set `COUNTER_SERVER_URL` if the server uses a URL other than `http://localhost:9000`.",
    ],
  },
]);
