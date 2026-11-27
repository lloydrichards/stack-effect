import { assert, describe, it } from "@effect/vitest";
import { buildOfficialCatalog } from "@repo/catalog-official/service";
import {
  ModuleCapability,
  ModuleCategory,
  ModuleDependency,
  ModuleId,
  TargetKind,
} from "@repo/domain/Catalog";
import { Effect, Schema } from "effect";

// Registry invariants are checked on the built document, as consumers see it.
const { document } = await Effect.runPromise(buildOfficialCatalog);
const moduleRegistry = document.modules;
const targetRegistry = document.targets;
const decodeDependencies = Schema.decodeUnknownSync(
  Schema.Array(ModuleDependency),
);

describe("moduleRegistry", () => {
  it("attaches MCP capabilities to existing chat features with app-owned connections", () => {
    for (const kind of ["server", "cli"]) {
      const parent = kind === "server" ? "server-chat-rpc" : "cli-chat-driver";
      const target = { kind, name: kind === "server" ? "api" : "app" };
      const connection = moduleRegistry.find(
        (module) => module.id === `${kind}-chat-mcp`,
      );
      assert.strictEqual(connection?.visibility ?? "public", "public");
      assert.strictEqual(connection?.title, "MCP Connection for Chat");
      assert.deepStrictEqual(
        connection?.dependencies,
        decodeDependencies([
          { _tag: "required-module", target, moduleId: parent },
        ]),
      );
      for (const capability of ["tools", "resources", "prompts"]) {
        const id = `${kind}-chat-mcp-${capability}`;
        const child = moduleRegistry.find((module) => module.id === id);
        assert.deepStrictEqual(child?.supportedOn, [
          { _tag: "kind", kind: TargetKind.make(kind) },
        ]);
        assert.deepStrictEqual(
          child?.dependencies,
          decodeDependencies([
            { _tag: "required-module", target, moduleId: parent },
            { _tag: "required-module", target, moduleId: `${kind}-chat-mcp` },
            ...(capability === "resources"
              ? [
                  {
                    _tag: "required-module",
                    target: { kind: "package", name: "domain" },
                    moduleId: "domain-mcp-resources",
                  },
                ]
              : []),
            ...(capability === "prompts"
              ? [
                  {
                    _tag: "required-module",
                    target: { kind: "package", name: "domain" },
                    moduleId:
                      kind === "server"
                        ? "domain-chat-mcp-prompts"
                        : "domain-chat-mcp-options",
                  },
                ]
              : []),
          ]),
        );
        assert.containSubset(child?.contributions, [
          {
            _tag: "file",
            path: `{{targetPath}}/src/mcp/Mcp${capability[0]?.toUpperCase()}${capability.slice(1)}.ts`,
          },
        ]);
        if (capability === "prompts") {
          assert.containSubset(child?.contributions, [
            {
              _tag: "file",
              path:
                kind === "cli"
                  ? "{{targetPath}}/src/mcp/McpPromptOptions.ts"
                  : "{{targetPath}}/src/rpc/Prompt.ts",
            },
          ]);
        }
        assert.deepInclude(connection?.children ?? [], {
          moduleId: ModuleId.make(id),
          requirement: "optional",
        });
        const parents =
          kind === "server"
            ? [parent]
            : [parent, "cli-command-chat-ask", "cli-command-chat-terminal"];
        for (const idOfParent of parents) {
          assert.deepInclude(
            moduleRegistry.find((module) => module.id === idOfParent)
              ?.children ?? [],
            {
              moduleId: ModuleId.make(`${kind}-chat-mcp`),
              requirement: "optional",
            },
          );
          assert.notDeepInclude(
            moduleRegistry.find((module) => module.id === idOfParent)
              ?.children ?? [],
            { moduleId: ModuleId.make(id), requirement: "optional" },
          );
        }
      }
    }
    assert.deepStrictEqual(
      moduleRegistry.filter((module) =>
        ["server-mcp-client", "cli-mcp-client", "package-mcp-client"].includes(
          module.id,
        ),
      ),
      [],
    );
  });

  it("keeps reusable MCP prompt models independent of chat request composition", () => {
    const models = moduleRegistry.find(
      (module) => module.id === "domain-mcp-prompts",
    );
    assert.isDefined(models);
    assert.doesNotContainSubset(models.dependencies, [
      { moduleId: "domain-chat-contracts" },
    ]);
    assert.doesNotContainSubset(models.contributions, [
      { _tag: "ts-object-field" },
    ]);
    const options = moduleRegistry.find(
      (module) => module.id === "domain-chat-mcp-options",
    );
    assert.containSubset(options?.contributions, [
      {
        _tag: "ts-object-field",
        targetVariable: "ChatTurnOptions",
        field: "prompt",
      },
    ]);
  });

  it("offers a publishable library on named package targets without child modules", () => {
    const library = moduleRegistry.find(
      (module) => module.id === "package-library",
    );
    const packageTarget = targetRegistry.find(
      (target) => target.kind === "package",
    );
    assert.deepStrictEqual(library?.supportedOn, [
      { _tag: "kind", kind: TargetKind.make("package") },
    ]);
    assert.deepStrictEqual(library?.children ?? [], []);
    assert.deepStrictEqual(library?.dependencies, []);
    assert.strictEqual(packageTarget?.visibility ?? "public", "public");
    assert.strictEqual(packageTarget?.defaultName, "library");
  });
  it("should expose every compatible catalog target and module for Deno", () => {
    assert.deepStrictEqual(
      targetRegistry
        .filter((target) => !target.supportedRuntimes?.includes("deno"))
        .map((target) => target.kind),
      ["cloudflare-worker", "docs"],
    );
    assert.deepStrictEqual(
      moduleRegistry
        .filter((module) => !module.supportedRuntimes?.includes("deno"))
        .map((module) => module.id),
      [
        "workspace-monorepo-turbo",
        "cloudflare-worker-http",
        "client-react-http-api-worker",
        "client-foldkit-http-api-worker",
        "alchemy-cloudflare",
        "workspace-alchemy-cafe",
        "alchemy-worker-deployment",
        "alchemy-client-foldkit-website",
        "alchemy-client-react-website",
        "package-library",
        "docs-mermaid",
      ],
    );
  });

  it("should list Nx and Vite+ as Turbo conflicts when monorepo modules are registered", () => {
    const turbo = moduleRegistry.find(
      (mod) => mod.id === "workspace-monorepo-turbo",
    );
    const nx = moduleRegistry.find((mod) => mod.id === "workspace-monorepo-nx");
    const vitePlus = moduleRegistry.find(
      (mod) => mod.id === "workspace-monorepo-vite-plus",
    );
    assert.isDefined(nx);
    assert.isDefined(vitePlus);
    assert.include(nx.categories ?? [], ModuleCategory.make("monorepo"));
    assert.include(vitePlus.categories ?? [], ModuleCategory.make("monorepo"));
    assert.deepStrictEqual(turbo?.conflictsWith, [
      ModuleId.make("workspace-monorepo-vite-plus"),
      ModuleId.make("workspace-monorepo-nx"),
    ]);
  });

  it("should register Oxfmt as a formatter alternative when catalog modules are listed", () => {
    const oxfmt = moduleRegistry.find(
      (mod) => mod.id === "workspace-quality-oxfmt",
    );

    assert.isDefined(oxfmt);
    assert.include(oxfmt.categories ?? [], ModuleCategory.make("format"));
    assert.deepStrictEqual(oxfmt?.conflictsWith, [
      ModuleId.make("workspace-quality-biome-format"),
      ModuleId.make("workspace-quality-dprint"),
    ]);
  });

  it("should explain the global executable requirement when Vite+ is selected", () => {
    const vitePlus = moduleRegistry.find(
      (mod) => mod.id === "workspace-monorepo-vite-plus",
    );

    assert.lengthOf(vitePlus?.nextSteps ?? [], 1);
    assert.include(
      vitePlus?.nextSteps?.[0] ?? "",
      "https://viteplus.dev/guide/",
    );
  });

  it("should depend on a provider-neutral SQL capability when the Todo vertical slice is registered", () => {
    const todoModuleIds = [
      "domain-todo-contracts",
      "domain-todo-http-contracts",
      "domain-todo-rpc-contracts",
      "package-db-todo-repository",
      "server-http-api-todos",
      "server-http-rpc-todos",
      "client-react-http-api-todos",
    ];
    const todoModules = moduleRegistry.filter((module) =>
      todoModuleIds.includes(module.id),
    );
    const repository = todoModules.find(
      (module) => module.id === "package-db-todo-repository",
    );

    assert.lengthOf(todoModules, todoModuleIds.length);
    assert.containSubset(repository?.dependencies, [
      {
        _tag: "required-capability",
        capability: "db-sql",
      },
    ]);
    assert.deepStrictEqual(
      moduleRegistry
        .filter((module) =>
          module.provides?.includes(ModuleCapability.make("db-sql")),
        )
        .map((module) => module.id),
      ["package-db-sqlite", "package-db-postgres"],
    );
  });
});

for (const kind of ["client-foldkit", "client-react"]) {
  it(`${kind} Worker HTTP client implies HTTP handlers without Alchemy deployment`, () => {
    assert.deepStrictEqual(
      moduleRegistry.find((module) => module.id === `${kind}-http-api-worker`)
        ?.implies,
      [
        {
          targetKind: TargetKind.make("cloudflare-worker"),
          moduleId: ModuleId.make("cloudflare-worker-http"),
        },
      ],
    );
  });
}
