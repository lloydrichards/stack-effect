import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../../templates/", import.meta.url));

export const packageModules = defineModules(import.meta.url, [
  {
    id: "package-ai-core",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "AI Package",
    description:
      "Anthropic language model configuration and workflow utilities",
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
        target: {
          kind: "package",
          name: "domain",
        },
        moduleId: "domain-chat-contracts",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: template("./package-ai-core/src/index.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/LanguageModel.ts",
        contents: template("./package-ai-core/src/LanguageModel.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/workflow/MailboxEvents.ts",
        contents: template("./package-ai-core/src/workflow/MailboxEvents.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@effect/ai-anthropic",
        value: "4.0.0-rc.117",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "effect",
        value: "4.0.0-rc.117",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: ".",
        value: "./src/index.ts",
      },
    ],
  },
  {
    id: "package-ai-toolkit-think",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Think Toolkit",
    description:
      "Minimal AI toolkit with a think tool for step-by-step reasoning",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "ai",
        },
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/toolkits/ThinkToolkit.ts",
        contents: template(
          "./package-ai-toolkit-think/src/toolkits/ThinkToolkit.ts",
        ),
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/ThinkToolkit",
      },
    ],
  },
  {
    id: "package-ai-toolkit-datetime",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "DateTime Toolkit",
    description:
      "Timezone-aware date and time tool for time-sensitive agent behavior",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "ai",
        },
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/toolkits/DateTimeToolkit.ts",
        contents: template(
          "./package-ai-toolkit-datetime/src/toolkits/DateTimeToolkit.ts",
        ),
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/DateTimeToolkit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: ".",
        value: "./src/index.ts",
      },
    ],
  },
  {
    id: "package-ai-toolkit-math",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Math Toolkit",
    description: "Deterministic arithmetic evaluator for safe math computation",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "ai",
        },
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/toolkits/MathToolkit.ts",
        contents: template(
          "./package-ai-toolkit-math/src/toolkits/MathToolkit.ts",
        ),
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/MathToolkit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: ".",
        value: "./src/index.ts",
      },
    ],
  },
  {
    id: "package-ai-chat-toolkit-datetime",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "DateTime Toolkit",
    description: "Attach the shared date and time toolkit to the chat service",
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
        target: {
          kind: "package",
          name: "ai",
        },
        moduleId: "package-ai-chat-service",
      },
      {
        _tag: "required-module",
        target: {
          kind: "package",
          name: "ai",
        },
        moduleId: "package-ai-toolkit-datetime",
      },
    ],
    contributions: [
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "DateTimeToolkit",
        import: {
          moduleSpecifier: "../toolkits/DateTimeToolkit",
          namedImports: ["DateTimeToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "DateTimeToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/DateTimeToolkit",
          namedImports: ["DateTimeToolkitLive"],
        },
      },
    ],
  },
  {
    id: "package-ai-chat-toolkit-math",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Math Toolkit",
    description:
      "Attach the shared deterministic math toolkit to the chat service",
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
        target: {
          kind: "package",
          name: "ai",
        },
        moduleId: "package-ai-chat-service",
      },
      {
        _tag: "required-module",
        target: {
          kind: "package",
          name: "ai",
        },
        moduleId: "package-ai-toolkit-math",
      },
    ],
    contributions: [
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "MathToolkit",
        import: {
          moduleSpecifier: "../toolkits/MathToolkit",
          namedImports: ["MathToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "MathToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/MathToolkit",
          namedImports: ["MathToolkitLive"],
        },
      },
    ],
  },
  {
    id: "package-ai-toolkit-memory",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Memory Toolkit",
    description:
      "Key-value scratchpad for persisting facts across tool invocations",
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "ai",
        },
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/toolkits/MemoryToolkit.ts",
        contents: template(
          "./package-ai-toolkit-memory/src/toolkits/MemoryToolkit.ts",
        ),
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/MemoryToolkit",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "MemoryToolkit",
        import: {
          moduleSpecifier: "../toolkits/MemoryToolkit",
          namedImports: ["MemoryToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "InMemoryToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/MemoryToolkit",
          namedImports: ["InMemoryToolkitLive"],
        },
      },
    ],
  },
  {
    id: "package-ai-toolkit-plan",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Plan Toolkit",
    description:
      "Structured task tracking that forces plan-before-act discipline",
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "ai",
        },
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/toolkits/PlanToolkit.ts",
        contents: template(
          "./package-ai-toolkit-plan/src/toolkits/PlanToolkit.ts",
        ),
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./toolkits/PlanToolkit",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkit",
        functionName: "Toolkit.merge",
        argument: "PlanToolkit",
        import: {
          moduleSpecifier: "../toolkits/PlanToolkit",
          namedImports: ["PlanToolkit"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "PlanToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/PlanToolkit",
          namedImports: ["PlanToolkitLive"],
        },
      },
    ],
  },
  {
    id: "package-ai-toolkit-webfetch",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "WebFetch Toolkit",
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
    dependencies: [],
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
        targetVariable: "ChatToolkitLive",
        functionName: "Layer.mergeAll",
        argument: "WebFetchToolkitLive",
        import: {
          moduleSpecifier: "../toolkits/WebFetchToolkit",
          namedImports: ["WebFetchToolkitLive"],
        },
      },
    ],
  },
  {
    id: "package-ai-chat-service",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Chat Service",
    description:
      "AI chat service with agentic loop for streaming tool-augmented conversations",
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
        target: {
          kind: "package",
          name: "domain",
        },
        moduleId: "domain-chat-contracts",
      },
      {
        _tag: "required-module",
        target: {
          kind: "package",
          name: "ai",
        },
        moduleId: "package-ai-core",
      },
      {
        _tag: "required-module",
        target: {
          kind: "package",
          name: "ai",
        },
        moduleId: "package-ai-toolkit-think",
      },
    ],
    children: [
      {
        moduleId: "package-ai-chat-toolkit-datetime",
        requirement: "optional",
      },
      {
        moduleId: "package-ai-chat-toolkit-math",
        requirement: "optional",
      },
      {
        moduleId: "package-ai-toolkit-memory",
        requirement: "optional",
      },
      {
        moduleId: "package-ai-toolkit-plan",
        requirement: "optional",
      },
      {
        moduleId: "package-ai-toolkit-webfetch",
        requirement: "optional",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/AiChatService.ts",
        contents: template(
          "./package-ai-chat-service/src/services/AiChatService.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/workflow/AgenticLoop.ts",
        contents: template(
          "./package-ai-chat-service/src/workflow/AgenticLoop.ts",
        ),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./services/AiChatService",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./workflow/AgenticLoop",
      },
    ],
  },
  {
    id: "package-db-sqlite",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "SQLite Database",
    description: "Reusable Effect SQL SQLite package with migrations",
    provides: ["db-sql"],
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "db",
        },
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: template("./package-db-sqlite/src/index.ts"),
      },
      {
        _tag: "file",
        path: "{{#if runtime=deno}}{{targetPath}}/src/DenoSqliteCompat.ts{{/if}}",
        contents: template("./package-db-sqlite/src/DenoSqliteCompat.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/Database.ts",
        contents: template("./package-db-sqlite/src/Database.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/Migrations.ts",
        contents: template("./package-db-sqlite/src/Migrations.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/HealthCheck.ts",
        contents: template("./package-db-sqlite/src/HealthCheck.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/migrations/0001_create_db_health.ts",
        contents: template(
          "./package-db-sqlite/src/migrations/0001_create_db_health.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/scripts/migrate.ts",
        contents: template("./package-db-sqlite/scripts/migrate.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/scripts/health.ts",
        contents: template("./package-db-sqlite/scripts/health.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "{{#if runtime=bun}}@effect/platform-bun{{/if}}{{#if runtime=node}}@effect/platform-node{{/if}}{{#if runtime=deno}}@effect/platform-deno{{/if}}",
        value: "4.0.0-rc.117",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "{{#if runtime=bun}}@effect/sql-sqlite-bun{{/if}}{{#if runtime=node}}@effect/sql-sqlite-node{{/if}}{{#if runtime=deno}}@effect/sql-sqlite-node{{/if}}",
        value: "4.0.0-rc.117",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if runtime=node}}tsx{{/if}}",
        value: "^4.21.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if runtime=deno}}@types/node{{/if}}",
        value: "^26.1.2",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: ".",
        value: "./src/index.ts",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "db:migrate",
        value:
          "{{#if runtime=bun}}bun run scripts/migrate.ts{{/if}}{{#if runtime=node}}node --import tsx scripts/migrate.ts{{/if}}{{#if runtime=deno}}deno run --allow-env --allow-read --allow-write --allow-ffi scripts/migrate.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "db:health",
        value:
          "{{#if runtime=bun}}bun run scripts/health.ts{{/if}}{{#if runtime=node}}node --import tsx scripts/health.ts{{/if}}{{#if runtime=deno}}deno run --allow-env --allow-read --allow-write --allow-ffi scripts/health.ts{{/if}}",
      },
    ],
    nextSteps: [
      "SQLite Database: Set `DATABASE_FILE` for `{{targetPath}}` if you want a database path other than the default `../../data/app.sqlite`.{{#if runtime=deno}} Set `DATABASE_FILE=./data/app.sqlite` when launching a compiled executable from the project root.{{/if}}",
    ],
  },
  {
    id: "package-db-postgres",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Postgres Database",
    description: "Reusable Effect SQL Postgres package with migrations",
    provides: ["db-sql"],
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "db",
        },
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: template("./package-db-sqlite/src/index.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/Database.ts",
        contents: template("./package-db-postgres/src/Database.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/Migrations.ts",
        contents: template("./package-db-postgres/src/Migrations.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/HealthCheck.ts",
        contents: template("./package-db-sqlite/src/HealthCheck.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/migrations/0001_create_db_health.ts",
        contents: template(
          "./package-db-postgres/src/migrations/0001_create_db_health.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/scripts/migrate.ts",
        contents: template("./package-db-sqlite/scripts/migrate.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/scripts/health.ts",
        contents: template("./package-db-sqlite/scripts/health.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/.env.example",
        contents: template("./package-db-postgres/.env.example"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/docker-compose.yml",
        contents: template("./package-db-postgres/docker-compose.yml"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "{{#if runtime=bun}}@effect/platform-bun{{/if}}{{#if runtime=node}}@effect/platform-node{{/if}}{{#if runtime=deno}}@effect/platform-deno{{/if}}",
        value: "4.0.0-rc.117",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@effect/sql-pg",
        value: "4.0.0-rc.117",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if runtime=node}}tsx{{/if}}",
        value: "^4.21.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: ".",
        value: "./src/index.ts",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "db:migrate",
        value:
          "{{#if runtime=bun}}bun run scripts/migrate.ts{{/if}}{{#if runtime=node}}node --import tsx scripts/migrate.ts{{/if}}{{#if runtime=deno}}deno run --allow-env --allow-read --allow-write --allow-net scripts/migrate.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "db:health",
        value:
          "{{#if runtime=bun}}bun run scripts/health.ts{{/if}}{{#if runtime=node}}node --import tsx scripts/health.ts{{/if}}{{#if runtime=deno}}deno run --allow-env --allow-read --allow-write --allow-net scripts/health.ts{{/if}}",
      },
    ],
    nextSteps: [
      "Postgres Database: Copy `{{targetPath}}/.env.example` to `{{targetPath}}/.env`, update the connection settings if needed, then start Postgres with `docker compose -f {{targetPath}}/docker-compose.yml up -d` before running database scripts.",
    ],
  },
  {
    id: "package-db-todo-repository",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Todo Repository",
    description:
      "Persistent Todo CRUD repository over the selected SQL database",
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "db",
        },
      },
    ],
    dependencies: [
      {
        _tag: "required-capability",
        target: {
          kind: "package",
          name: "db",
        },
        capability: "db-sql",
      },
      {
        _tag: "required-module",
        target: {
          kind: "package",
          name: "domain",
        },
        moduleId: "domain-todo-contracts",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/TodoRepository.ts",
        contents: template(
          "./package-db-todo-repository/src/TodoRepository.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/migrations/0002_create_todos.ts",
        contents: template(
          "./package-db-todo-repository/src/migrations/0002_create_todos.ts",
        ),
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./TodoRepository",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "@effect/sql-sqlite-node",
        value: "4.0.0-rc.117",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "@effect/sql-pg",
        value: "4.0.0-rc.117",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "vitest run --passWithNoTests",
      },
    ],
  },
  {
    id: "package-presence-service",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Presence Package",
    description:
      "Real-time presence tracking service with PubSub and client generation",
    visibility: "internal",
    supportedOn: [
      {
        _tag: "identity",
        identity: {
          kind: "package",
          name: "presence",
        },
      },
    ],
    dependencies: [
      {
        _tag: "required-module",
        target: {
          kind: "package",
          name: "domain",
        },
        moduleId: "domain-ws-contracts",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: template("./package-presence-service/src/index.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/ClientGenerator.ts",
        contents: template(
          "./package-presence-service/src/services/ClientGenerator.ts",
        ),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/services/PresenceService.ts",
        contents: template(
          "./package-presence-service/src/services/PresenceService.ts",
        ),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "@repo/domain",
        value: "{{workspaceDependency}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "effect",
        value: "4.0.0-rc.117",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: ".",
        value: "./src/index.ts",
      },
    ],
  },
]);
