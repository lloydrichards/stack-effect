import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));
const workflow = { kind: "package", name: "workflow" };

export const receiptWorkflow = defineModules(import.meta.url, [
  {
    id: "package-receipt-workflow",
    title: "Receipt Workflow",
    description:
      "Typed receipt workflow with an injected store and a durable wait",
    visibility: "internal",
    supportedRuntimes: ["bun"],
    supportedOn: [{ _tag: "identity", identity: workflow }],
    dependencies: [],
    contributions: [
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
      "{{#if module=package-library}}Build the workflow package with `bun run --cwd {{targetPath}} build` before running the receipt CLI.{{/if}}",
    ],
  },
  {
    id: "cli-workflow-receipt",
    title: "Durable Receipt Workflow",
    description: "Run a receipt workflow in memory or resume it through SQLite",
    supportedRuntimes: ["bun"],
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
      ...["@repo/db", "@repo/workflow"].map((name) => ({
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
      "Run `bun {{targetPath}}/src/index.ts workflow demo` for the in-memory workflow. See `{{targetPath}}/WORKFLOW.md` for the SQLite restart walkthrough.",
    ],
  },
]);
