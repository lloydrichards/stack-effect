import { defineModules } from "@repo/authoring/Define";
import { templates } from "@repo/authoring/Template";
import { EFFECT_VERSION } from "@repo/catalog-official/dependencies";

const template = templates(new URL("../templates/", import.meta.url));

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
        value: EFFECT_VERSION,
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
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./WebFetchToolkit",
        value: "./src/toolkits/WebFetchToolkit.ts",
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
    id: "package-task-plan",
    title: "Graph Task Planner",
    description:
      "Order tasks by prerequisite and report missing prerequisites or cycles",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "package" }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/TaskPlan.ts",
        contents: template("./package-task-plan/src/TaskPlan.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/scratchpad.ts",
        contents: template("./package-task-plan/scratchpad.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./TaskPlan",
        value:
          "{{#if module=package-library}}./dist/TaskPlan.js{{/if}}{{#if noModule=package-library}}./src/TaskPlan.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "scratch",
        value:
          "{{#if runtime=bun}}bun scratchpad.ts{{/if}}{{#if runtime=node}}node scratchpad.ts{{/if}}{{#if runtime=deno}}deno run scratchpad.ts{{/if}}",
      },
    ],
    nextSteps: [
      "Task Planner: From `{{targetPath}}`, run `{{#if runtime=deno}}deno task{{/if}}{{#if runtime=bun}}{{packageManager}} run{{/if}}{{#if runtime=node}}{{packageManager}} run{{/if}} scratch` to see the task order.",
    ],
  },
]);
