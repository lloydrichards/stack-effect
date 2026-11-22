import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));
const workflow = { kind: "package", name: "workflow" };
const domainDependency = {
  _tag: "required-module",
  target: { kind: "package", name: "domain" },
  moduleId: "domain-receipt-api",
} as const;

export const receiptWorkflow = defineModules(import.meta.url, [
  {
    id: "package-receipt-workflow",
    title: "Receipt Workflow",
    description:
      "Typed receipt workflow with an injected store and a durable wait",
    visibility: "internal",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: workflow }],
    dependencies: [domainDependency],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/Receipt.ts",
        contents: template("./package-receipt-workflow/src/Receipt.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/ReceiptRuntime.ts",
        contents: template("./package-receipt-workflow/src/ReceiptRuntime.ts"),
      },
      ...["Receipt", "ReceiptRuntime"].map((file) => ({
        _tag: "pkg-json-entry" as const,
        path: "{{targetPath}}/package.json",
        field: "exports" as const,
        name: `./${file}`,
        value: `{{#if noModule=package-library}}./src/${file}.ts{{/if}}{{#if module=package-library}}./dist/${file}.js{{/if}}`,
      })),
    ],
    nextSteps: [
      "{{#if module=package-library}}Run `{{runCommand}} build` in `{{targetPath}}` before running the receipt CLI.{{/if}}",
    ],
  },
  {
    id: "cli-workflow-receipt",
    title: "Durable Receipt Workflow",
    description: "Run a receipt workflow in memory or resume it through SQLite",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "cli" }],
    dependencies: [
      {
        _tag: "required-module",
        target: workflow,
        moduleId: "package-receipt-workflow",
      },
      {
        _tag: "required-module",
        target: { kind: "package", name: "db" },
        moduleId: "package-db-sqlite",
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "{{#if runtime=deno}}workflow:run{{/if}}",
        value:
          "deno run --allow-env --allow-net --allow-read --allow-write --allow-ffi src/index.ts",
      },
      {
        _tag: "file",
        path: "{{targetPath}}/WORKFLOW.md",
        contents: template("./cli-workflow-receipt/WORKFLOW.md"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/commands/workflow.ts",
        contents: template("./cli-workflow-receipt/src/commands/workflow.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/workflows/ReceiptRuntime.ts",
        contents: template(
          "./cli-workflow-receipt/src/workflows/ReceiptRuntime.ts",
        ),
      },
      ...["@repo/db", "@repo/domain", "@repo/workflow"].map((name) => ({
        _tag: "pkg-json-entry" as const,
        path: "{{targetPath}}/package.json",
        field: "dependencies" as const,
        name,
        value: "{{workspaceDependency}}",
      })),
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllCommands",
        functionName: "Command.withSubcommands",
        argument: "workflow",
        import: {
          moduleSpecifier: "./commands/workflow",
          namedImports: ["workflow"],
        },
      },
    ],
    nextSteps: [
      "See `{{targetPath}}/WORKFLOW.md` to run the in-memory workflow and resume it through SQLite.",
    ],
  },
]);
