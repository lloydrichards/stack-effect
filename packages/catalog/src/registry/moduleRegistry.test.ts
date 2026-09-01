import { ModuleCapability } from "@repo/domain/Catalog";
import { describe, expect, it } from "vitest";
import { moduleRegistry } from "./moduleRegistry";

describe("moduleRegistry", () => {
  const knownIds = new Set(moduleRegistry.map((m) => m.id));

  it("should have unique module ids", () => {
    const ids = moduleRegistry.map((m) => m.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });

  it("registers Husky as an optional developer-experience module", () => {
    const husky = moduleRegistry.find(
      (module) => module.id === "workspace-devenv-husky",
    );
    if (!husky) throw new Error("Husky module must be registered");

    expect(husky).toMatchObject({
      id: "workspace-devenv-husky",
      title: "Husky + lint-staged",
      categories: ["devenv"],
      dependencies: [
        { _tag: "required-module", moduleId: "workspace-devenv-git" },
      ],
      scripts: [
        {
          label: "Install Husky",
          command: "{{packageManager}} run husky:install",
          phase: "post-finalize",
        },
      ],
    });
    expect(husky.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _tag: "file",
          path: "{{targetPath}}/.husky/pre-commit",
          contents: "{{packageManager}} run lint-staged\n",
        }),
        expect.objectContaining({
          _tag: "pkg-json-entry",
          field: "devDependencies",
          name: "husky",
          value: "9.1.7",
        }),
        expect.objectContaining({
          _tag: "pkg-json-entry",
          field: "devDependencies",
          name: "lint-staged",
          value: "17.4.1",
        }),
      ]),
    );

    const lintStagedConfig = husky.contributions.find(
      (contribution) =>
        contribution._tag === "file" &&
        contribution.path === "{{targetPath}}/.lintstagedrc.json",
    );
    if (lintStagedConfig?._tag !== "file") {
      throw new Error("Husky must contribute .lintstagedrc.json");
    }
    expect(lintStagedConfig.contents).toBe(`{
  "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}": [
    "{{packageManager}} run --if-present format --"{{#if lint=biome}},
    "{{packageManager}} run lint --"{{/if}}{{#if lint=oxlint}},
    "{{packageManager}} run lint:fix --"{{/if}}
  ]
}
`);

    for (const [lint, commands] of [
      [undefined, []],
      ["biome", ["bun run lint --"]],
      ["oxlint", ["bun run lint:fix --"]],
    ] as const) {
      const config = JSON.parse(
        lintStagedConfig.contents
          .replaceAll("{{packageManager}}", "bun")
          .replace(/{{#if lint=biome}}([\s\S]*?){{\/if}}/g, (_, contents) =>
            lint === "biome" ? contents : "",
          )
          .replace(/{{#if lint=oxlint}}([\s\S]*?){{\/if}}/g, (_, contents) =>
            lint === "oxlint" ? contents : "",
          ),
      );
      expect(config).toEqual({
        "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}": [
          "bun run --if-present format --",
          ...commands,
        ],
      });
    }

    expect(lintStagedConfig.contents).not.toContain("git add");
    expect(
      husky.contributions.flatMap((contribution) =>
        contribution._tag === "pkg-json-entry" &&
        contribution.field === "scripts"
          ? [[contribution.name, contribution.value]]
          : [],
      ),
    ).toEqual([
      ["husky:install", "husky"],
      ["lint-staged", "lint-staged"],
    ]);
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
