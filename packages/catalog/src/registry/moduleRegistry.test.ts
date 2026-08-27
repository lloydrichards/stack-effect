import {
  ContextId,
  DddArchitecture,
  ModuleCapability,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { describe, expect, it } from "vitest";
import {
  dddSharedDomainIndexContents,
  dddSharedDomainPackageJsonContents,
  dddSharedDomainTsconfigContents,
  dddTodoHostContents,
  dddTodoHostPackageJsonContents,
  dddTodoPresentationHttpTestContents,
} from "./content/todo";
import { moduleRegistry } from "./moduleRegistry";
import { targetRegistry } from "./targetRegistry";

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

  it("should explain the global executable requirement when Vite+ is selected", () => {
    const vitePlus = moduleRegistry.find(
      (mod) => mod.id === "workspace-monorepo-vite-plus",
    );

    expect(vitePlus?.nextSteps).toEqual([
      expect.stringContaining("https://viteplus.dev/guide/"),
    ]);
  });

  it("should register DDD Todo on the canonical server API owner", () => {
    const serverApi = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "api",
    });
    const sharedDomain = new TargetIdentity({
      kind: TargetKind.make("package"),
      name: "shared-domain",
    });
    const dddServer = targetRegistry
      .find(({ kind }) => kind === "server")
      ?.architecture?.variants.find(({ id }) => id === DddArchitecture);
    const dddApi = moduleRegistry
      .find(({ id }) => id === "server-http-api")
      ?.architecture?.variants.find(({ id }) => id === DddArchitecture);
    const dddTodo = moduleRegistry
      .find(({ id }) => id === "server-http-api-todos")
      ?.architecture?.variants.find(({ id }) => id === DddArchitecture);
    const providers = moduleRegistry.filter(({ id }) =>
      [
        "server-http-api-todos-provider-sqlite",
        "server-http-api-todos-provider-postgres",
      ].includes(id),
    );
    const owners = moduleRegistry.flatMap((module) => [
      ...module.supportedOn.flatMap((supportedOn) =>
        supportedOn._tag === "identity" ? [supportedOn.identity.toKey()] : [],
      ),
      ...module.dependencies.flatMap((dependency) =>
        dependency._tag === "required-module"
          ? [dependency.target.toKey()]
          : [],
      ),
    ]);

    expect([
      serverApi.toKey(),
      serverApi.toPath(),
      serverApi.toPackageName(),
    ]).toEqual(["apps/server-api", "apps/server-api", "server-api"]);
    expect(dddServer?.layout).toEqual({ _tag: "identity" });
    expect(dddApi?.dependencies).toContainEqual({
      _tag: "required-module",
      target: sharedDomain,
      moduleId: ModuleId.make("package-shared-domain"),
      architecture: DddArchitecture,
    });
    expect(dddTodo?.supportedOn).toEqual([
      { _tag: "identity", identity: serverApi },
    ]);
    expect(dddTodo?.dependencies).toContainEqual({
      _tag: "required-module",
      target: serverApi,
      moduleId: ModuleId.make("server-http-api"),
    });
    expect(providers).toHaveLength(2);
    for (const provider of providers) {
      expect(provider.supportedOn).toEqual([
        { _tag: "identity", identity: serverApi },
      ]);
      expect(provider.dependencies).toContainEqual({
        _tag: "required-module",
        target: serverApi,
        moduleId: ModuleId.make("server-http-api-todos"),
        architecture: DddArchitecture,
      });
    }
    expect(owners).not.toContain("apps/server-todo-api");
  });

  it("should register the Todo vertical slice with provider-neutral SQL dependencies", () => {
    const todoModuleIds = [
      "domain-todo-contracts",
      "domain-todo-http-contracts",
      "domain-todo-rpc-contracts",
      "package-db-todo-repository",
      "server-http-api-todos",
      "server-http-api-todos-provider-sqlite",
      "server-http-api-todos-provider-postgres",
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

  it("should model the DDD Todo graph with one host operation per physical path", () => {
    const sharedDomain = new TargetIdentity({
      kind: TargetKind.make("package"),
      name: "shared-domain",
    });
    const todoDomain = new TargetIdentity({
      kind: TargetKind.make("package"),
      name: "todo-domain",
    });
    const serverApi = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "api",
    });
    const module = (id: string) =>
      moduleRegistry.find((candidate) => candidate.id === id);
    const dddVariant = (id: string) =>
      module(id)?.architecture?.variants.find(
        (variant) => variant.id === DddArchitecture,
      );
    const filePaths = (id: string) =>
      module(id)
        ?.contributions.filter((contribution) => contribution._tag === "file")
        .map((contribution) => contribution.path);

    expect(module("package-shared-domain")).toMatchObject({
      id: ModuleId.make("package-shared-domain"),
      visibility: "internal",
      supportedOn: [{ _tag: "identity", identity: sharedDomain }],
      dependencies: [],
      architecture: {
        default: DddArchitecture,
        context: { id: ContextId.make("shared"), role: "domain" },
        variants: [],
      },
    });
    expect(module("package-shared-domain")?.contributions).toEqual([
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: dddSharedDomainPackageJsonContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: dddSharedDomainTsconfigContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: dddSharedDomainIndexContents,
      },
    ]);
    expect(dddVariant("server-http-api")?.dependencies).toEqual([
      {
        _tag: "required-module",
        target: sharedDomain,
        moduleId: ModuleId.make("package-shared-domain"),
        architecture: DddArchitecture,
      },
    ]);
    expect(dddVariant("server-http-api-todos")?.contributions).toEqual([
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: dddTodoHostContents,
      },
    ]);
    expect(
      dddVariant("server-http-api-todos")?.contributions,
    ).not.toContainEqual(expect.objectContaining({ _tag: "pkg-json-entry" }));
    expect(dddTodoHostPackageJsonContents).not.toContain("@repo/shared-domain");

    expect(filePaths("package-todo-domain")).toEqual([
      "{{targetPath}}/package.json",
      "{{targetPath}}/tsconfig.json",
      "{{targetPath}}/src/todo.ts",
      "{{targetPath}}/test/todo.test.ts",
      "{{targetPath}}/src/api.http.ts",
      "{{targetPath}}/src/todo.http.ts",
      "{{targetPath}}/test/http.test.ts",
      "{{targetPath}}/src/index.ts",
    ]);
    expect(filePaths("package-todo-application")).toContain(
      "{{targetPath}}/test/use-cases.test.ts",
    );
    expect(filePaths("package-todo-application")).not.toContain(
      "{{targetPath}}/src/use-cases.test.ts",
    );
    expect(filePaths("package-todo-infrastructure")).toContain(
      "{{targetPath}}/test/memory.test.ts",
    );
    expect(filePaths("package-todo-infrastructure")).not.toContain(
      "{{targetPath}}/src/memory.test.ts",
    );
    expect(
      module("server-http-api-todos-provider-sqlite")?.contributions,
    ).toContainEqual(
      expect.objectContaining({
        _tag: "file",
        path: "packages/todo/infrastructure/test/sqlite.test.ts",
      }),
    );
    expect(filePaths("package-todo-presentation-http")).toContain(
      "{{targetPath}}/test/http.test.ts",
    );
    expect(
      module("package-todo-presentation-http")?.contributions,
    ).toContainEqual(
      expect.objectContaining({
        _tag: "file",
        path: "{{targetPath}}/test/http.test.ts",
        contents: dddTodoPresentationHttpTestContents,
      }),
    );

    for (const [id, field, value] of [
      ["server-http-api-todos-provider-sqlite", "sqlite", "TodoSqliteLive"],
      [
        "server-http-api-todos-provider-postgres",
        "postgres",
        "TodoPostgresLive",
      ],
    ] as const) {
      expect(module(id)?.supportedOn).toEqual([
        { _tag: "identity", identity: serverApi },
      ]);
      expect(module(id)?.contributions).toContainEqual({
        _tag: "ts-object-field",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "repositoryProviders",
        functionName: "defineRepositoryProviders",
        field,
        value,
        import: {
          moduleSpecifier: `@repo/todo-infrastructure/${field}`,
          namedImports: [value],
        },
      });
    }

    const dddClient = dddVariant("client-react-http-api-todos");
    expect(
      dddClient?.dependencies.filter(
        (dependency) =>
          dependency._tag === "required-module" &&
          dependency.target.toKey() === todoDomain.toKey() &&
          dependency.moduleId === ModuleId.make("domain-todo-http-contracts"),
      ),
    ).toHaveLength(1);
    expect(
      dddClient?.contributions.filter(
        (contribution) =>
          contribution._tag === "pkg-json-entry" &&
          contribution.name === "@repo/todo-domain",
      ),
    ).toHaveLength(1);
  });
});
