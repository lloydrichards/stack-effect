import { ModuleCapability } from "@repo/domain/Catalog";
import { describe, expect, it } from "vitest";
import { pnpmWorkspaceContents } from "./content/init";
import { moduleRegistry } from "./moduleRegistry";

describe("moduleRegistry", () => {
  const knownIds = new Set(moduleRegistry.map((m) => m.id));

  it("should have unique module ids", () => {
    const ids = moduleRegistry.map((m) => m.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });

  it("should only reference existing modules in dependencies", () => {
    const missing: Array<{ module: string; references: string }> = [];

    for (const mod of moduleRegistry) {
      for (const dep of mod.dependencies) {
        if (dep._tag === "required-module" && !knownIds.has(dep.moduleId)) {
          missing.push({
            module: mod.id,
            references: dep.moduleId,
          });
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("should only require capabilities with compatible providers", () => {
    const missing: Array<{
      module: string;
      capability: string;
      target: string;
    }> = [];

    for (const mod of moduleRegistry) {
      for (const dep of mod.dependencies) {
        if (dep._tag !== "required-capability") continue;

        const providers = moduleRegistry.filter(
          (provider) =>
            provider.provides?.includes(dep.capability) &&
            provider.supportedOn.some((supportedOn) =>
              dep.target.matches(supportedOn),
            ),
        );

        if (providers.length === 0) {
          missing.push({
            module: mod.id,
            capability: dep.capability,
            target: dep.target.toKey(),
          });
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("should only reference existing modules in implies", () => {
    const missing: Array<{ module: string; references: string }> = [];

    for (const mod of moduleRegistry) {
      for (const imp of mod.implies ?? []) {
        if (!knownIds.has(imp.moduleId)) {
          missing.push({
            module: mod.id,
            references: imp.moduleId,
          });
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("should require symmetric references when modules declare conflicts", () => {
    const invalid = moduleRegistry.flatMap((mod) =>
      (mod.conflictsWith ?? []).flatMap((conflict) => {
        const conflictingModule = moduleRegistry.find(
          (candidate) => candidate.id === conflict,
        );

        return conflictingModule === undefined ||
          !conflictingModule.conflictsWith?.includes(mod.id)
          ? [{ module: mod.id, conflictsWith: conflict }]
          : [];
      }),
    );

    expect(invalid).toEqual([]);
  });

  it("should register Nx and Vite+ as mutually exclusive Turbo alternatives", () => {
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
    expect(nx?.conflictsWith).toEqual([
      "workspace-monorepo-turbo",
      "workspace-monorepo-vite-plus",
    ]);
    expect(vitePlus?.conflictsWith).toEqual([
      "workspace-monorepo-turbo",
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

  it.each([
    {
      id: "workspace-git-hooks-lefthook",
      conflict: "workspace-git-hooks-husky",
      files: ["{{targetPath}}/lefthook.yml"],
      dependencies: { lefthook: "2.1.10" },
      scripts: {
        "lefthook:install": "lefthook install",
        "git-hooks:format":
          "{{#if format=biome}}biome format --write{{/if}}{{#if format=oxfmt}}oxfmt{{/if}}",
        "git-hooks:lint":
          "{{#if lint=biome}}biome lint --write{{/if}}{{#if lint=oxlint}}oxlint --fix{{/if}}",
      },
      installer: "{{packageManager}} run lefthook:install",
    },
    {
      id: "workspace-git-hooks-husky",
      conflict: "workspace-git-hooks-lefthook",
      files: [
        "{{targetPath}}/.husky/pre-commit",
        "{{targetPath}}/lint-staged.config.mjs",
      ],
      dependencies: { husky: "9.1.7", "lint-staged": "17.4.1" },
      scripts: {
        "husky:install": "husky",
        "lint-staged": "lint-staged",
        "git-hooks:format":
          "{{#if format=biome}}biome format --write{{/if}}{{#if format=oxfmt}}oxfmt{{/if}}",
        "git-hooks:lint":
          "{{#if lint=biome}}biome lint --write{{/if}}{{#if lint=oxlint}}oxlint --fix{{/if}}",
      },
      installer: "{{packageManager}} run husky:install",
    },
  ])("registers exact native $id contributions", (contract) => {
    const provider = moduleRegistry.find((mod) => mod.id === contract.id);

    expect(provider).toBeDefined();
    expect(provider?.categories).toEqual(["git-hooks"]);
    expect(provider?.conflictsWith).toEqual([contract.conflict]);
    expect(provider?.dependencies).toContainEqual({
      _tag: "required-module",
      target: expect.objectContaining({ kind: "workspace", name: "root" }),
      moduleId: "workspace-devenv-git",
    });

    const files = provider?.contributions.filter(
      (item) => item._tag === "file",
    );
    expect(files?.map((item) => item.path)).toEqual(contract.files);

    const entries = Object.fromEntries(
      (provider?.contributions ?? [])
        .filter((item) => item._tag === "pkg-json-entry")
        .map((item) => [`${item.field}.${item.name}`, item.value]),
    );
    expect(entries).toMatchObject(
      Object.fromEntries(
        Object.entries(contract.dependencies).map(([name, value]) => [
          `devDependencies.${name}`,
          value,
        ]),
      ),
    );
    expect(entries).toMatchObject(
      Object.fromEntries(
        Object.entries(contract.scripts).map(([name, value]) => [
          `scripts.${name}`,
          value,
        ]),
      ),
    );
    expect(entries["scripts.prepare"]).toBeUndefined();
    expect(provider?.scripts).toEqual([
      expect.objectContaining({
        command: contract.installer,
        phase: "post-finalize",
      }),
    ]);
    expect(provider?.nextSteps).toEqual([
      expect.stringContaining("initial commit"),
      expect.stringContaining("staged"),
      expect.stringContaining("non-fixable"),
    ]);
  });

  it("defines filename-aware serial provider configurations without prohibited setup", () => {
    const providers = moduleRegistry.filter((mod) =>
      mod.id.startsWith("workspace-git-hooks-"),
    );
    const contents = providers
      .flatMap((provider) =>
        provider.contributions.flatMap((item) =>
          item._tag === "file" ? [item.contents] : [],
        ),
      )
      .join("\n");
    const commands = providers
      .flatMap((provider) => [
        ...(provider.scripts ?? []).map((script) => script.command),
        ...provider.contributions.flatMap((item) =>
          item._tag === "pkg-json-entry" ? [item.value] : [],
        ),
      ])
      .join("\n");

    expect(providers.map((provider) => provider.id)).toEqual([
      "workspace-git-hooks-lefthook",
      "workspace-git-hooks-husky",
    ]);
    expect(contents).toContain("*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}");
    expect(contents).toContain("parallel: false");
    expect(contents).toContain("stage_fixed: true");
    expect(contents).toContain('"{{packageManager}} run git-hooks:format --"');
    expect(contents).toContain('"{{packageManager}} run git-hooks:lint --"');
    expect(commands).not.toMatch(/husky init|git add|chmod|postinstall/);
  });

  it("adds the Lefthook pnpm allow-build entry only through module presence", () => {
    expect(pnpmWorkspaceContents).toContain(
      "{{#if module=workspace-git-hooks-lefthook}}\n  lefthook: true{{/if}}",
    );
  });

  it("should explain the global executable requirement when Vite+ is selected", () => {
    const vitePlus = moduleRegistry.find(
      (mod) => mod.id === "workspace-monorepo-vite-plus",
    );

    expect(vitePlus?.nextSteps).toEqual([
      expect.stringContaining("https://viteplus.dev/guide/"),
    ]);
  });

  it("should register the Todo vertical slice with provider-neutral SQL dependencies", () => {
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
    expect(todoModules.map((module) => module.id)).toEqual(
      expect.arrayContaining(todoModuleIds),
    );
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
