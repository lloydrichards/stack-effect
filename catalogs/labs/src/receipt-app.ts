import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));
const domain = { kind: "package", name: "domain" };
const server = { kind: "server", name: "api" };
const contracts = {
  _tag: "required-module",
  target: domain,
  moduleId: "domain-receipt-api",
} as const;
const workflowServer = {
  _tag: "required-module",
  target: server,
  moduleId: "server-workflow-receipt",
} as const;

const workspaceDependency = (name: string) => ({
  _tag: "pkg-json-entry" as const,
  path: "{{targetPath}}/package.json",
  field: "dependencies" as const,
  name,
  value: "{{workspaceDependency}}",
});

const browserClient = {
  _tag: "file",
  path: "{{targetPath}}/src/lib/receipt-client.ts",
  contents: template("./workflow-receipt-client/src/lib/receipt-client.ts"),
} as const;
const browserHistory = {
  _tag: "file" as const,
  path: "{{targetPath}}/src/lib/receipt-history.ts",
  contents: template("./workflow-receipt-client/src/lib/receipt-history.ts"),
} as const;
const foldkitImport = {
  moduleSpecifier: "./features/receipt",
  namespaceImport: "Receipt",
};
const foldkitMain = "{{targetPath}}/src/main.ts";

export const receiptApp = defineModules(import.meta.url, [
  {
    id: "domain-receipt-api",
    title: "Receipt API Contract",
    description: "Shared receipt submission and execution status schemas",
    visibility: "internal",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: domain }],
    dependencies: [],
    contributions: [
      ...["Receipt", "ReceiptApi"].flatMap((file) => [
        {
          _tag: "file" as const,
          path: `{{targetPath}}/src/${file}.ts`,
          contents: template(`./domain-receipt-api/src/${file}.ts`),
        },
        {
          _tag: "pkg-json-entry" as const,
          path: "{{targetPath}}/package.json",
          field: "exports" as const,
          name: `./${file}`,
          value: `./src/${file}.ts`,
        },
      ]),
    ],
  },
  {
    id: "server-workflow-receipt",
    title: "Receipt Workflow API",
    description:
      "Start and poll a receipt workflow through the existing HTTP server",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [
      contracts,
      {
        _tag: "required-module",
        target: server,
        moduleId: "server-http-api",
      },
      {
        _tag: "required-module",
        target: { kind: "package", name: "workflow" },
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
        path: "{{targetPath}}/src/api/Receipt.ts",
        contents: template("./server-workflow-receipt/src/api/Receipt.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/workflows/ReceiptRuntime.ts",
        contents: template(
          "./server-workflow-receipt/src/workflows/ReceiptRuntime.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/RECEIPTS.md",
        contents: template("./server-workflow-receipt/RECEIPTS.md"),
      },
      ...["@repo/workflow", "@repo/db"].map(workspaceDependency),
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "RouterDependencies",
        functionName: "Layer.mergeAll",
        argument: "ReceiptRuntimeLive",
        import: {
          moduleSpecifier: "./workflows/ReceiptRuntime",
          namedImports: ["ReceiptRuntimeLive"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "ReceiptApiLive",
        import: {
          moduleSpecifier: "./api/Receipt",
          namedImports: ["ReceiptApiLive"],
        },
      },
    ],
    nextSteps: [
      "See `{{targetPath}}/RECEIPTS.md` for the receipt workflow endpoints and browser setup.",
    ],
  },
  {
    id: "client-react-workflow-receipt",
    title: "Receipt Workflow Form (React)",
    description:
      "Submit a receipt and recover its workflow status after refresh",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "client-react" }],
    dependencies: [contracts, workflowServer],
    contributions: [
      workspaceDependency("@repo/domain"),
      browserClient,
      browserHistory,
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/receipt-form.tsx",
        contents: template(
          "./client-react-workflow-receipt/src/components/receipt-form.tsx",
        ),
      },
      {
        _tag: "jsx-slot",
        path: "{{targetPath}}/src/app.tsx",
        slotId: "components",
        content: "<ReceiptForm />",
        import: {
          moduleSpecifier: "./components/receipt-form",
          namedImports: ["ReceiptForm"],
        },
      },
    ],
  },
  {
    id: "client-foldkit-workflow-receipt",
    title: "Receipt Workflow Form (Foldkit)",
    description: "Submit and follow a receipt workflow using Foldkit commands",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "client-foldkit" }],
    dependencies: [contracts, workflowServer],
    contributions: [
      workspaceDependency("@repo/domain"),
      browserClient,
      browserHistory,
      {
        _tag: "file",
        path: "{{targetPath}}/src/features/receipt.ts",
        contents: template(
          "./client-foldkit-workflow-receipt/src/features/receipt.ts",
        ),
      },
      {
        _tag: "ts-object-field",
        path: foldkitMain,
        targetVariable: "Model",
        functionName: "S.Struct",
        field: "receipt",
        value: "Receipt.Model",
        import: foldkitImport,
      },
      {
        _tag: "ts-call-arg",
        path: foldkitMain,
        targetVariable: "Message",
        functionName: "S.Union",
        argument: "Receipt.GotMessage",
        import: foldkitImport,
      },
      {
        _tag: "ts-object-field",
        path: foldkitMain,
        targetVariable: "update",
        functionName: "M.tagsExhaustive",
        field: "GotReceiptMessage",
        value: `({ message }) => {
          const [receipt, commands] = Receipt.update(model.receipt, message);
          return {
            model: { ...model, receipt },
            commands: Command.mapMessages(commands, (message) => Receipt.GotMessage({ message })),
          };
        }`,
        import: foldkitImport,
      },
      {
        _tag: "ts-call-arg",
        path: foldkitMain,
        targetVariable: "init",
        functionName: "Init.compose",
        argument: `Init.child(Receipt, "receipt", Receipt.GotMessage)`,
        import: foldkitImport,
      },
      {
        _tag: "ts-call-arg",
        path: foldkitMain,
        targetVariable: "subscriptions",
        functionName: "Subscription.aggregate",
        argument: `Subscription.lift(Receipt.subscriptions)<Model, Message>({
          read: (model) => Option.some(model.receipt),
          toParentMessage: (message) => Receipt.GotMessage({ message }),
        })`,
        import: {
          moduleSpecifier: "effect",
          namedImports: ["Option"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: foldkitMain,
        targetVariable: "view",
        functionName: "Views.compose",
        argument:
          "Receipt.view(model.receipt, (message) => Receipt.GotMessage({ message }), h)",
        import: foldkitImport,
      },
    ],
  },
]);
