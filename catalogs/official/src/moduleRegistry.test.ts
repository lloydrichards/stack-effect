import { ModuleCapability } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { buildOfficialCatalog } from "./service";

// Registry invariants are checked on the built document, as consumers see it.
const { document } = await Effect.runPromise(buildOfficialCatalog);
const moduleRegistry = document.modules;
const targetRegistry = document.targets;

describe("moduleRegistry", () => {
  it("attaches MCP capabilities to existing chat features with app-owned connections", () => {
    for (const kind of ["server", "cli"]) {
      const parent = kind === "server" ? "server-chat-rpc" : "cli-chat-driver";
      const target = { kind, name: kind === "server" ? "api" : "app" };
      const connection = moduleRegistry.find(
        (module) => module.id === `${kind}-chat-mcp`,
      );
      expect(connection?.visibility ?? "public").toBe("public");
      expect(connection?.title).toBe("MCP Client");
      expect(connection?.dependencies).toEqual([
        { _tag: "required-module", target, moduleId: parent },
      ]);
      for (const capability of ["tools", "resources", "prompts"]) {
        const id = `${kind}-chat-mcp-${capability}`;
        const child = moduleRegistry.find((module) => module.id === id);
        expect(child?.supportedOn).toEqual([{ _tag: "kind", kind }]);
        expect(child?.dependencies).toEqual([
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
        ]);
        expect(child?.contributions).toContainEqual(
          expect.objectContaining({
            _tag: "file",
            path: `{{targetPath}}/src/mcp/Mcp${capability[0]?.toUpperCase()}${capability.slice(1)}.ts`,
          }),
        );
        if (capability === "prompts") {
          expect(child?.contributions).toContainEqual(
            expect.objectContaining({
              _tag: "ts-call-arg",
              targetVariable: "ChatTurnPreparations",
              argument: "makeMcpPromptPreparation",
            }),
          );
          expect(child?.contributions).toContainEqual(
            expect.objectContaining({
              _tag: "file",
              path:
                kind === "cli"
                  ? "{{targetPath}}/src/mcp/McpPromptOptions.ts"
                  : "{{targetPath}}/src/rpc/Prompt.ts",
            }),
          );
        } else {
          expect(child?.contributions).toContainEqual(
            expect.objectContaining({
              _tag: "ts-call-arg",
              targetVariable: "ChatTurnPreparations",
              functionName: "Effect.all",
            }),
          );
        }
        expect(connection?.children).toContainEqual({
          moduleId: id,
          requirement: "optional",
        });
        const parents =
          kind === "server"
            ? [parent]
            : [parent, "cli-command-chat-ask", "cli-command-chat-terminal"];
        for (const idOfParent of parents) {
          expect(
            moduleRegistry.find((module) => module.id === idOfParent)?.children,
          ).toContainEqual({
            moduleId: `${kind}-chat-mcp`,
            requirement: "optional",
          });
          expect(
            moduleRegistry.find((module) => module.id === idOfParent)?.children,
          ).not.toContainEqual({ moduleId: id, requirement: "optional" });
        }
      }
    }
    expect(
      moduleRegistry.filter((module) =>
        ["server-mcp-client", "cli-mcp-client", "package-mcp-client"].includes(
          module.id,
        ),
      ),
    ).toEqual([]);
  });

  it("keeps reusable MCP prompt models independent of chat request composition", () => {
    const models = moduleRegistry.find(
      (module) => module.id === "domain-mcp-prompts",
    );
    expect(models?.dependencies).not.toContainEqual(
      expect.objectContaining({ moduleId: "domain-chat-contracts" }),
    );
    expect(models?.contributions).not.toContainEqual(
      expect.objectContaining({ _tag: "ts-object-field" }),
    );
    const options = moduleRegistry.find(
      (module) => module.id === "domain-chat-mcp-options",
    );
    expect(options?.contributions).toContainEqual(
      expect.objectContaining({
        _tag: "ts-object-field",
        targetVariable: "ChatTurnOptions",
        field: "prompt",
      }),
    );
  });

  it("offers a publishable library on named package targets without child modules", () => {
    const library = moduleRegistry.find(
      (module) => module.id === "package-library",
    );
    const packageTarget = targetRegistry.find(
      (target) => target.kind === "package",
    );
    expect(library?.supportedOn).toEqual([{ _tag: "kind", kind: "package" }]);
    expect(library?.children ?? []).toEqual([]);
    expect(library?.dependencies).toEqual([]);
    expect(packageTarget?.visibility ?? "public").toBe("public");
    expect(packageTarget?.defaultName).toBe("library");
  });
  it("should expose every compatible catalog target and module for Deno", () => {
    expect(
      targetRegistry
        .filter((target) => !target.supportedRuntimes?.includes("deno"))
        .map((target) => target.kind),
    ).toEqual(["cloudflare-worker"]);
    expect(
      moduleRegistry
        .filter((module) => !module.supportedRuntimes?.includes("deno"))
        .map((module) => module.id),
    ).toEqual([
      "workspace-monorepo-turbo",
      "cloudflare-worker-http",
      "client-react-http-api-worker",
      "client-foldkit-http-api-worker",
      "alchemy-cloudflare",
      "alchemy-worker-deployment",
      "alchemy-client-foldkit-website",
      "alchemy-client-react-website",
      "package-library",
    ]);
  });

  it("should list Nx and Vite+ as Turbo conflicts when monorepo modules are registered", () => {
    const turbo = moduleRegistry.find(
      (mod) => mod.id === "workspace-monorepo-turbo",
    );
    const nx = moduleRegistry.find((mod) => mod.id === "workspace-monorepo-nx");
    const vitePlus = moduleRegistry.find(
      (mod) => mod.id === "workspace-monorepo-vite-plus",
    );
    expect(nx).toBeDefined();
    expect(vitePlus).toBeDefined();
    expect(nx?.categories).toContain("monorepo");
    expect(vitePlus?.categories).toContain("monorepo");
    expect(turbo?.conflictsWith).toEqual([
      "workspace-monorepo-vite-plus",
      "workspace-monorepo-nx",
    ]);
  });

  it("should register Oxfmt as a formatter alternative when catalog modules are listed", () => {
    const oxfmt = moduleRegistry.find(
      (mod) => mod.id === "workspace-quality-oxfmt",
    );

    expect(oxfmt).toBeDefined();
    expect(oxfmt?.categories).toContain("format");
    expect(oxfmt?.conflictsWith).toEqual([
      "workspace-quality-biome-format",
      "workspace-quality-dprint",
    ]);
  });

  it("should explain the global executable requirement when Vite+ is selected", () => {
    const vitePlus = moduleRegistry.find(
      (mod) => mod.id === "workspace-monorepo-vite-plus",
    );

    expect(vitePlus?.nextSteps).toEqual([
      expect.stringContaining("https://viteplus.dev/guide/"),
    ]);
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

    expect(todoModules).toHaveLength(todoModuleIds.length);
    expect(repository?.dependencies).toContainEqual(
      expect.objectContaining({
        _tag: "required-capability",
        capability: "db-sql",
      }),
    );
    expect(
      moduleRegistry
        .filter((module) =>
          module.provides?.includes(ModuleCapability.make("db-sql")),
        )
        .map((module) => module.id),
    ).toEqual(["package-db-sqlite", "package-db-postgres"]);
  });
});

for (const kind of ["client-foldkit", "client-react"]) {
  it(`${kind} Worker HTTP client implies HTTP handlers without Alchemy deployment`, () => {
    expect(
      moduleRegistry.find((module) => module.id === `${kind}-http-api-worker`)
        ?.implies,
    ).toEqual([
      { targetKind: "cloudflare-worker", moduleId: "cloudflare-worker-http" },
    ]);
  });
}
