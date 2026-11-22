import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));
// Publishable Library compiles and packs src. Keep the workspace-only planner outside it.
const plannerDirectory =
  "{{#if module=package-library}}examples/task-plan{{/if}}{{#if noModule=package-library}}src{{/if}}";
const domainTarget = { kind: "package", name: "domain" };

export const experiments = defineModules(import.meta.url, [
  {
    id: "server-chat-runtime-managed",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Managed Chat Runtime",
    description: "In-memory managed chat send, watch, and interrupt runtime",
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [
      {
        _tag: "required-module",
        target: { kind: "package", name: "domain" },
        moduleId: "domain-chat-managed-contracts",
      },
      {
        _tag: "required-module",
        target: {
          kind: "server",
          name: "api",
        },
        moduleId: "server-chat-rpc",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/rpc/ChatManaged.ts",
        contents: template(
          "./server-chat-runtime-managed/src/Rpc/ChatManaged.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/runtime/ChatManagedRuntime.ts",
        contents: template(
          "./server-chat-runtime-managed/src/runtime/ChatManagedRuntime.ts",
        ),
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "ChatManagedRpcRoutes",
        import: {
          moduleSpecifier: "./rpc/ChatManaged",
          namedImports: ["ChatManagedRpcRoutes"],
        },
      },
    ],
  },
  {
    id: "client-react-web-worker",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Web Worker RPC",
    description:
      "Browser Worker RPC with Effect Schema, Stream, Schedule, and Atom RPC",
    supportedOn: [{ _tag: "kind", kind: "client-react" }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/workers/import-validation/domain.ts",
        contents: template(
          "./client-react-web-worker/src/workers/import-validation/domain.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/workers/import-validation/import-validation.worker.ts",
        contents: template(
          "./client-react-web-worker/src/workers/import-validation/import-validation.worker.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/import-validation-worker.ts",
        contents: template(
          "./client-react-web-worker/src/lib/import-validation-worker.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/import-validation-card.tsx",
        contents: template(
          "./client-react-web-worker/src/components/import-validation-card.tsx",
        ),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@effect/platform-browser",
        value: "4.1.4",
      },
      {
        _tag: "jsx-slot",
        path: "{{targetPath}}/src/app.tsx",
        slotId: "components",
        content: "<ImportValidationCard />",
        import: {
          moduleSpecifier: "./components/import-validation-card",
          namedImports: ["ImportValidationCard"],
        },
      },
    ],
  },
  {
    id: "package-ai-toolkit-webfetch",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Web Fetch Toolkit",
    description:
      "URL content retrieval with HTML stripping for retrieval-augmented workflows",
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "ai",
        },
      },
    ],
    dependencies: [
      {
        _tag: "required-module",
        target: { kind: "package", name: "ai" },
        moduleId: "package-ai-chat-service",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/toolkits/WebFetchToolkit.ts",
        contents: template(
          "./package-ai-toolkit-webfetch/src/toolkits/WebFetchToolkit.ts",
        ),
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/WebFetchToolkit",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "WebFetchToolkit",
        import: {
          moduleSpecifier: "../toolkits/WebFetchToolkit",
          namedImports: ["WebFetchToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitHandlers",
        functionName: "Layer.mergeAll",
        argument: "WebFetchToolkitHandlers",
        import: {
          moduleSpecifier: "../toolkits/WebFetchToolkit",
          namedImports: ["WebFetchToolkitHandlers"],
        },
      },
    ],
  },
  {
    id: "domain-task-plan",
    title: "Task Planner Contracts",
    description: "Shared task schemas and planning errors",
    visibility: "internal",
    supportedRuntimes: ["bun"],
    supportedOn: [{ _tag: "identity", identity: domainTarget }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Task.ts",
        contents: template("./domain-task-plan/src/Task.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./Task",
        value: "./src/Task.ts",
      },
    ],
  },
  {
    id: "package-task-plan",
    title: "Graph Task Planner",
    description:
      "Order tasks by prerequisite and report missing prerequisites or cycles",
    supportedRuntimes: ["bun"],
    supportedOn: [
      { _tag: "identity", identity: { kind: "package", name: "task-plan" } },
    ],
    dependencies: [
      {
        _tag: "required-module",
        target: domainTarget,
        moduleId: "domain-task-plan",
      },
    ],
    contributions: [
      ...["TaskPlan.ts", "scratchpad.ts"].map((file) => ({
        _tag: "file" as const,
        path: `{{targetPath}}/${plannerDirectory}/${file}`,
        contents: template(`./package-task-plan/src/${file}`),
      })),
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "{{#if noModule=package-library}}@repo/domain{{/if}}",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if module=package-library}}@repo/domain{{/if}}",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "{{#if noModule=package-library}}./TaskPlan{{/if}}",
        value: "./src/TaskPlan.ts",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "scratch",
        value: `bun ${plannerDirectory}/scratchpad.ts`,
      },
    ],
    nextSteps: [
      "Task Planner: Run `bun run --cwd {{targetPath}} scratch` to see the task order.{{#if module=package-library}} The planner is a workspace example and is excluded from the published library.{{/if}}",
    ],
  },
]);
