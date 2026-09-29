import { ModuleCapability } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { buildOfficialCatalog } from "./service";

// Registry invariants are checked on the built document, as consumers see it.
const { document } = await Effect.runPromise(buildOfficialCatalog);
const moduleRegistry = document.modules;
const targetRegistry = document.targets;

describe("moduleRegistry", () => {
  it("should expose every compatible catalog target and module for Deno", () => {
    expect(
      targetRegistry
        .filter((target) => !target.supportedRuntimes?.includes("deno"))
        .map((target) => target.kind),
    ).toEqual([]);
    expect(
      moduleRegistry
        .filter((module) => !module.supportedRuntimes?.includes("deno"))
        .map((module) => module.id),
    ).toEqual(["workspace-monorepo-turbo"]);
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
