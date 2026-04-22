import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Plan, type Plan as PlanModel } from "@repo/domain/Plan";
import type { Selection } from "@repo/domain/Selection";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { BlueprintService, PlanService } from ".";

const packageDomainTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["dist", "build", "node_modules"]
}
`;

const serverTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "dist",
    "noEmit": true,
    "types": ["@types/bun"]
  },
  "include": ["src/**/*", "../../packages/ai/src/LanguageModel.ts"],
  "exclude": ["node_modules", "dist"]
}
`;

const decodePlan = Schema.decodeUnknownSync(Plan as never) as (
  input: unknown,
) => PlanModel;

describe("@repo/scaffold", () => {
  it("projects base server target paths through the public entrypoint", async () => {
    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const repoRoot = yield* Effect.tryPromise(() =>
          mkdtemp(join(tmpdir(), "scaffold-server-base-")),
        );
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const typedPlan = decodePlan(plan);
    const rootBootstrapCause = {
      _tag: "selectedRepoModule" as const,
      moduleId: "root-bootstrap",
    };
    const serverTargetCause = {
      _tag: "selectedTarget" as const,
      targetId: "apps/server-api",
    };

    expect(typedPlan).toEqual(plan);
    expect(plan.entries).toStrictEqual([
      {
        _tag: "directory",
        path: "apps",
        causes: [serverTargetCause],
      },
      {
        _tag: "directory",
        path: "apps/server",
        causes: [serverTargetCause],
      },
      {
        _tag: "file",
        path: "apps/server/package.json",
        classification: "create",
        causes: [serverTargetCause],
      },
      {
        _tag: "directory",
        path: "apps/server/src",
        causes: [serverTargetCause],
      },
      {
        _tag: "file",
        path: "apps/server/src/index.ts",
        classification: "create",
        causes: [serverTargetCause],
      },
      {
        _tag: "file",
        path: "apps/server/tsconfig.json",
        classification: "create",
        causes: [serverTargetCause],
      },
    ]);
    expect(plan.tree).toStrictEqual({
      _tag: "directory",
      name: ".",
      path: ".",
      causes: [rootBootstrapCause],
      children: [
        {
          _tag: "directory",
          name: "apps",
          path: "apps",
          causes: [serverTargetCause],
          children: [
            {
              _tag: "directory",
              name: "server",
              path: "apps/server",
              causes: [serverTargetCause],
              children: [
                {
                  _tag: "directory",
                  name: "src",
                  path: "apps/server/src",
                  causes: [serverTargetCause],
                  children: [
                    {
                      _tag: "file",
                      name: "index.ts",
                      path: "apps/server/src/index.ts",
                      classification: "create",
                      causes: [serverTargetCause],
                    },
                  ],
                },
                {
                  _tag: "file",
                  name: "package.json",
                  path: "apps/server/package.json",
                  classification: "create",
                  causes: [serverTargetCause],
                },
                {
                  _tag: "file",
                  name: "tsconfig.json",
                  path: "apps/server/tsconfig.json",
                  classification: "create",
                  causes: [serverTargetCause],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("projects http-api-server module paths through the public entrypoint", async () => {
    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const repoRoot = yield* Effect.tryPromise(() =>
          mkdtemp(join(tmpdir(), "scaffold-entrypoint-")),
        );
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const typedPlan = decodePlan(plan);
    const rootBootstrapCause = {
      _tag: "selectedRepoModule" as const,
      moduleId: "root-bootstrap",
    };
    const serverTargetCause = {
      _tag: "selectedTarget" as const,
      targetId: "apps/server-api",
    };
    const httpApiServerCause = {
      _tag: "impliedTargetModule" as const,
      targetId: "apps/server-api",
      moduleId: "http-api-server",
      via: "apps/server-api:http-api-server",
    };

    const appsNode = plan.tree.children.find(
      (child) => child._tag === "directory" && child.path === "apps",
    );
    const serverNode =
      appsNode?._tag === "directory"
        ? appsNode.children.find(
            (child) =>
              child._tag === "directory" && child.path === "apps/server",
          )
        : undefined;
    const srcNode =
      serverNode?._tag === "directory"
        ? serverNode.children.find(
            (child) =>
              child._tag === "directory" && child.path === "apps/server/src",
          )
        : undefined;
    const apiNode =
      srcNode?._tag === "directory"
        ? srcNode.children.find(
            (child) =>
              child._tag === "directory" &&
              child.path === "apps/server/src/Api",
          )
        : undefined;

    expect(typedPlan).toEqual(plan);
    expect(plan.entries).toContainEqual({
      _tag: "directory",
      path: "apps",
      causes: expect.arrayContaining([serverTargetCause, httpApiServerCause]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "directory",
      path: "apps/server",
      causes: expect.arrayContaining([serverTargetCause, httpApiServerCause]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "directory",
      path: "apps/server/src",
      causes: expect.arrayContaining([serverTargetCause, httpApiServerCause]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "directory",
      path: "apps/server/src/Api",
      causes: expect.arrayContaining([httpApiServerCause]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "apps/server/package.json",
      classification: "create",
      causes: expect.arrayContaining([serverTargetCause]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "apps/server/src/Api/Health.ts",
      classification: "create",
      causes: expect.arrayContaining([httpApiServerCause]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "apps/server/src/Api/Hello.ts",
      classification: "create",
      causes: expect.arrayContaining([httpApiServerCause]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "apps/server/src/index.ts",
      classification: "create",
      causes: expect.arrayContaining([serverTargetCause, httpApiServerCause]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "apps/server/tsconfig.json",
      classification: "create",
      causes: expect.arrayContaining([serverTargetCause]),
    });
    expect(plan.tree._tag).toBe("directory");
    expect(plan.tree.name).toBe(".");
    expect(plan.tree.path).toBe(".");
    expect(plan.tree.causes).toEqual(
      expect.arrayContaining([rootBootstrapCause]),
    );
    expect(appsNode).toEqual(
      expect.objectContaining({
        _tag: "directory",
        name: "apps",
        path: "apps",
        causes: expect.arrayContaining([serverTargetCause, httpApiServerCause]),
      }),
    );
    expect(serverNode).toEqual(
      expect.objectContaining({
        _tag: "directory",
        name: "server",
        path: "apps/server",
        causes: expect.arrayContaining([serverTargetCause, httpApiServerCause]),
      }),
    );
    expect(srcNode).toEqual(
      expect.objectContaining({
        _tag: "directory",
        name: "src",
        path: "apps/server/src",
        causes: expect.arrayContaining([serverTargetCause, httpApiServerCause]),
      }),
    );
    expect(apiNode).toEqual(
      expect.objectContaining({
        _tag: "directory",
        name: "Api",
        path: "apps/server/src/Api",
        causes: expect.arrayContaining([httpApiServerCause]),
        children: expect.arrayContaining([
          expect.objectContaining({
            _tag: "file",
            name: "Health.ts",
            path: "apps/server/src/Api/Health.ts",
            classification: "create",
            causes: expect.arrayContaining([httpApiServerCause]),
          }),
          expect.objectContaining({
            _tag: "file",
            name: "Hello.ts",
            path: "apps/server/src/Api/Hello.ts",
            classification: "create",
            causes: expect.arrayContaining([httpApiServerCause]),
          }),
        ]),
      }),
    );
    expect(srcNode).toEqual(
      expect.objectContaining({
        children: expect.arrayContaining([
          expect.objectContaining({
            _tag: "file",
            name: "index.ts",
            path: "apps/server/src/index.ts",
            classification: "create",
            causes: expect.arrayContaining([
              serverTargetCause,
              httpApiServerCause,
            ]),
          }),
        ]),
      }),
    );
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("projects implied package/domain paths through the public entrypoint", async () => {
    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const repoRoot = yield* Effect.tryPromise(() =>
          mkdtemp(join(tmpdir(), "scaffold-domain-package-")),
        );
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const typedPlan = decodePlan(plan);
    const rootBootstrapCause = {
      _tag: "selectedRepoModule" as const,
      moduleId: "root-bootstrap",
    };
    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const impliedDomainApiCause = {
      _tag: "impliedTargetModule" as const,
      targetId: "packages/domain",
      moduleId: "domain-api",
      via: "required-target-module=>target-module:apps/server-api:http-api-server=>target-module:packages/domain:domain-api",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };

    const packagesNode = plan.tree.children.find(
      (child) => child._tag === "directory" && child.path === "packages",
    );
    const domainNode =
      packagesNode?._tag === "directory"
        ? packagesNode.children.find(
            (child) =>
              child._tag === "directory" && child.path === "packages/domain",
          )
        : undefined;
    const srcNode =
      domainNode?._tag === "directory"
        ? domainNode.children.find(
            (child) =>
              child._tag === "directory" &&
              child.path === "packages/domain/src",
          )
        : undefined;

    expect(typedPlan).toEqual(plan);
    expect(plan.entries).toContainEqual({
      _tag: "directory",
      path: "packages",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "directory",
      path: "packages/domain",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "directory",
      path: "packages/domain/src",
      causes: expect.arrayContaining([
        impliedDomainApiCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "create",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/src/Api.ts",
      classification: "create",
      causes: [impliedDomainApiCause],
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/src/index.ts",
      classification: "create",
      causes: [targetCompositionCause],
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/tsconfig.json",
      classification: "create",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
      ]),
    });
    expect(plan.tree._tag).toBe("directory");
    expect(plan.tree.name).toBe(".");
    expect(plan.tree.path).toBe(".");
    expect(plan.tree.causes).toEqual(
      expect.arrayContaining([rootBootstrapCause]),
    );
    expect(packagesNode).toEqual(
      expect.objectContaining({
        _tag: "directory",
        name: "packages",
        path: "packages",
        causes: expect.arrayContaining([
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
          impliedDomainApiCause,
        ]),
      }),
    );
    expect(domainNode).toEqual(
      expect.objectContaining({
        _tag: "directory",
        name: "domain",
        path: "packages/domain",
        causes: expect.arrayContaining([
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
          impliedDomainApiCause,
        ]),
      }),
    );
    expect(srcNode).toEqual(
      expect.objectContaining({
        _tag: "directory",
        name: "src",
        path: "packages/domain/src",
        causes: expect.arrayContaining([
          impliedDomainApiCause,
          targetCompositionCause,
        ]),
        children: expect.arrayContaining([
          expect.objectContaining({
            _tag: "file",
            name: "Api.ts",
            path: "packages/domain/src/Api.ts",
            classification: "create",
            causes: [impliedDomainApiCause],
          }),
          expect.objectContaining({
            _tag: "file",
            name: "index.ts",
            path: "packages/domain/src/index.ts",
            classification: "create",
            causes: [targetCompositionCause],
          }),
        ]),
      }),
    );
    expect(domainNode).toEqual(
      expect.objectContaining({
        children: expect.arrayContaining([
          expect.objectContaining({
            _tag: "file",
            name: "package.json",
            path: "packages/domain/package.json",
            classification: "create",
            causes: expect.arrayContaining([
              impliedCanonicalDomainTargetCause,
              impliedOwningDomainTargetCause,
              targetCompositionCause,
            ]),
          }),
          expect.objectContaining({
            _tag: "file",
            name: "tsconfig.json",
            path: "packages/domain/tsconfig.json",
            classification: "create",
            causes: expect.arrayContaining([
              impliedCanonicalDomainTargetCause,
              impliedOwningDomainTargetCause,
            ]),
          }),
        ]),
      }),
    );
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("merges recognized barrel export additions through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-domain-barrel-"));
    await mkdir(join(repoRoot, "packages/domain/src"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/src/index.ts"),
      'export * from "./Rpc";\n',
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };

    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/src/index.ts",
      classification: "modify",
      causes: [targetCompositionCause],
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("treats existing matching barrel exports as unchanged through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-domain-barrel-"));
    await mkdir(join(repoRoot, "packages/domain/src"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/src/index.ts"),
      'export * from "./Api";\nexport * from "./Rpc";\n',
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };

    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/src/index.ts",
      classification: "unchanged",
      causes: [targetCompositionCause],
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("defers unsupported barrel shapes to merge requirements through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-domain-barrel-"));
    await mkdir(join(repoRoot, "packages/domain/src"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/src/index.ts"),
      'export { Api } from "./Api";\n',
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };

    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/src/index.ts",
      classification: "needsMergeStrategy",
      causes: [targetCompositionCause],
    });
    expect(plan.mergeRequirements).toContainEqual({
      _tag: "barrelExport",
      path: "packages/domain/src/index.ts",
      exportPath: "./Api",
      causes: [targetCompositionCause],
    });
    expect(plan.warnings).toContainEqual({
      _tag: "mergeStrategyRequired",
      path: "packages/domain/src/index.ts",
      message: "Existing barrel exports require manual merge strategy.",
      requirement: {
        _tag: "barrelExport",
        path: "packages/domain/src/index.ts",
        exportPath: "./Api",
        causes: [targetCompositionCause],
      },
    });
  });

  it("merges recognized package export additions through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-domain-exports-"));
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          ".": "./src/index.ts",
        },
        dependencies: {
          effect: "4.0.0-beta.47",
        },
        devDependencies: {
          "@repo/config-typescript": "workspace:*",
        },
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "modify",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("treats existing matching package exports as unchanged through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-domain-exports-"));
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          ".": "./src/index.ts",
          "./Api": "./src/Api.ts",
        },
        scripts: {
          clean:
            "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
          "type-check": "tsc --noEmit",
        },
        dependencies: {
          effect: "4.0.0-beta.47",
        },
        devDependencies: {
          "@repo/config-typescript": "workspace:*",
        },
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "unchanged",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("defers unsupported package export shapes to merge requirements through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-domain-exports-"));
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          "./Api": {
            import: "./src/Api.ts",
          },
        },
        dependencies: {
          effect: "4.0.0-beta.47",
        },
        devDependencies: {
          "@repo/config-typescript": "workspace:*",
        },
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "needsMergeStrategy",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.mergeRequirements).toContainEqual({
      _tag: "packageJsonExports",
      path: "packages/domain/package.json",
      exportKey: "./Api",
          causes: [targetCompositionCause],
    });
    expect(plan.warnings).toContainEqual({
      _tag: "mergeStrategyRequired",
      path: "packages/domain/package.json",
      message: "Existing exports require manual merge strategy.",
      requirement: {
        _tag: "packageJsonExports",
        path: "packages/domain/package.json",
        exportKey: "./Api",
        causes: [targetCompositionCause],
      },
    });
  });

  it("creates package dependencies through the public entrypoint when package.json is absent", async () => {
    const repoRoot = await mkdtemp(
      join(tmpdir(), "scaffold-domain-dependencies-"),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "create",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("merges recognized package dependency additions through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(
      join(tmpdir(), "scaffold-domain-dependencies-"),
    );
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          ".": "./src/index.ts",
          "./Api": "./src/Api.ts",
        },
        scripts: {
          clean:
            "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
          "type-check": "tsc --noEmit",
        },
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "modify",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("treats existing matching package dependencies as unchanged through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(
      join(tmpdir(), "scaffold-domain-dependencies-"),
    );
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          ".": "./src/index.ts",
          "./Api": "./src/Api.ts",
        },
        scripts: {
          clean:
            "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
          "type-check": "tsc --noEmit",
        },
        dependencies: {
          effect: "4.0.0-beta.47",
        },
        devDependencies: {
          "@repo/config-typescript": "workspace:*",
        },
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "unchanged",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("retains dependency section information for incompatible package dependencies through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(
      join(tmpdir(), "scaffold-domain-dependencies-"),
    );
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          ".": "./src/index.ts",
          "./Api": "./src/Api.ts",
        },
        scripts: {
          clean:
            "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
          "type-check": "tsc --noEmit",
        },
        dependencies: {
          effect: "4.0.0-beta.46",
        },
        devDependencies: ["@repo/config-typescript"],
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "needsMergeStrategy",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([
      {
        _tag: "packageJsonDependencies",
        path: "packages/domain/package.json",
        section: "dependencies",
        dependencyName: "effect",
        causes: [
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
        ],
      },
      {
        _tag: "packageJsonDependencies",
        path: "packages/domain/package.json",
        section: "devDependencies",
        dependencyName: "@repo/config-typescript",
        causes: [
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
        ],
      },
    ]);
    expect(plan.warnings).toStrictEqual([
      {
        _tag: "mergeStrategyRequired",
        path: "packages/domain/package.json",
        message: "Existing dependencies require manual merge strategy.",
        requirement: {
          _tag: "packageJsonDependencies",
          path: "packages/domain/package.json",
          section: "dependencies",
          dependencyName: "effect",
          causes: [
            impliedCanonicalDomainTargetCause,
            impliedOwningDomainTargetCause,
          ],
        },
      },
      {
        _tag: "mergeStrategyRequired",
        path: "packages/domain/package.json",
        message: "Existing devDependencies require manual merge strategy.",
        requirement: {
          _tag: "packageJsonDependencies",
          path: "packages/domain/package.json",
          section: "devDependencies",
          dependencyName: "@repo/config-typescript",
          causes: [
            impliedCanonicalDomainTargetCause,
            impliedOwningDomainTargetCause,
          ],
        },
      },
    ]);
  });

  it("defers unsupported package dependency shapes to merge requirements through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(
      join(tmpdir(), "scaffold-domain-dependencies-"),
    );
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          ".": "./src/index.ts",
          "./Api": "./src/Api.ts",
        },
        dependencies: ["effect"],
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };

    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "needsMergeStrategy",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([
      {
        _tag: "packageJsonDependencies",
        path: "packages/domain/package.json",
        section: "dependencies",
        dependencyName: "effect",
        causes: [
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
        ],
      },
    ]);
    expect(plan.warnings).toStrictEqual([
      {
        _tag: "mergeStrategyRequired",
        path: "packages/domain/package.json",
        message: "Existing dependencies require manual merge strategy.",
        requirement: {
          _tag: "packageJsonDependencies",
          path: "packages/domain/package.json",
          section: "dependencies",
          dependencyName: "effect",
          causes: [
            impliedCanonicalDomainTargetCause,
            impliedOwningDomainTargetCause,
          ],
        },
      },
    ]);
  });

  it("merges recognized server package script additions through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-server-scripts-"));
    await mkdir(join(repoRoot, "apps/server"), { recursive: true });
    await writeFile(
      join(repoRoot, "apps/server/package.json"),
      JSON.stringify({
        name: "server",
        version: "0.0.1",
        scripts: {
          dev: "bun --watch run src/index.ts",
        },
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const serverTargetCause = {
      _tag: "selectedTarget" as const,
      targetId: "apps/server-api",
    };

    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "apps/server/package.json",
      classification: "modify",
      causes: [serverTargetCause],
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("treats existing matching package scripts as unchanged through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-domain-scripts-"));
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          ".": "./src/index.ts",
          "./Api": "./src/Api.ts",
        },
        scripts: {
          clean:
            "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
          "type-check": "tsc --noEmit",
        },
        dependencies: {
          effect: "4.0.0-beta.47",
        },
        devDependencies: {
          "@repo/config-typescript": "workspace:*",
        },
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };

    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "unchanged",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("defers unsupported package script shapes to merge requirements through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-domain-scripts-"));
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          ".": "./src/index.ts",
          "./Api": "./src/Api.ts",
        },
        scripts: ["type-check"],
        dependencies: {
          effect: "4.0.0-beta.47",
        },
        devDependencies: {
          "@repo/config-typescript": "workspace:*",
        },
      }),
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };

    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "needsMergeStrategy",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([
      {
        _tag: "packageJsonScripts",
        path: "packages/domain/package.json",
        scriptName: "clean",
        causes: [
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
        ],
      },
      {
        _tag: "packageJsonScripts",
        path: "packages/domain/package.json",
        scriptName: "type-check",
        causes: [
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
        ],
      },
    ]);
    expect(plan.warnings).toStrictEqual([
      {
        _tag: "mergeStrategyRequired",
        path: "packages/domain/package.json",
        message: "Existing scripts require manual merge strategy.",
        requirement: {
          _tag: "packageJsonScripts",
          path: "packages/domain/package.json",
          scriptName: "clean",
          causes: [
            impliedCanonicalDomainTargetCause,
            impliedOwningDomainTargetCause,
          ],
        },
      },
      {
        _tag: "mergeStrategyRequired",
        path: "packages/domain/package.json",
        message: "Existing scripts require manual merge strategy.",
        requirement: {
          _tag: "packageJsonScripts",
          path: "packages/domain/package.json",
          scriptName: "type-check",
          causes: [
            impliedCanonicalDomainTargetCause,
            impliedOwningDomainTargetCause,
          ],
        },
      },
    ]);
  });

  it("classifies missing scaffold tsconfig files as create through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-tsconfig-create-"));

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const serverTargetCause = {
      _tag: "selectedTarget" as const,
      targetId: "apps/server-api",
    };

    expect(plan.entries).toContainEqual(
      expect.objectContaining({
        _tag: "file",
        path: "apps/server/tsconfig.json",
        classification: "create",
        causes: expect.arrayContaining([serverTargetCause]),
      }),
    );
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/tsconfig.json",
      classification: "create",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("treats existing matching scaffold tsconfig files as unchanged through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(
      join(tmpdir(), "scaffold-tsconfig-unchanged-"),
    );
    await mkdir(join(repoRoot, "apps/server"), { recursive: true });
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "apps/server/tsconfig.json"),
      serverTsconfigContents,
    );
    await writeFile(
      join(repoRoot, "packages/domain/tsconfig.json"),
      packageDomainTsconfigContents,
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const serverTargetCause = {
      _tag: "selectedTarget" as const,
      targetId: "apps/server-api",
    };

    expect(plan.entries).toContainEqual(
      expect.objectContaining({
        _tag: "file",
        path: "apps/server/tsconfig.json",
        classification: "unchanged",
        causes: expect.arrayContaining([serverTargetCause]),
      }),
    );
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/tsconfig.json",
      classification: "unchanged",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("defers incompatible scaffold tsconfig files to merge requirements through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-tsconfig-merge-"));
    await mkdir(join(repoRoot, "apps/server"), { recursive: true });
    await mkdir(join(repoRoot, "packages/domain"), { recursive: true });
    await writeFile(
      join(repoRoot, "apps/server/tsconfig.json"),
      '{"extends":"@repo/config-typescript/base.json"}\n',
    );
    await writeFile(
      join(repoRoot, "packages/domain/tsconfig.json"),
      '{"extends":"@repo/config-typescript/base.json"}\n',
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const serverTargetCause = {
      _tag: "selectedTarget" as const,
      targetId: "apps/server-api",
    };

    expect(plan.entries).toContainEqual(
      expect.objectContaining({
        _tag: "file",
        path: "apps/server/tsconfig.json",
        classification: "needsMergeStrategy",
        causes: expect.arrayContaining([serverTargetCause]),
      }),
    );
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/tsconfig.json",
      classification: "needsMergeStrategy",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
      ]),
    });
    expect(plan.mergeRequirements).toContainEqual(
      expect.objectContaining({
        _tag: "tsconfig",
        path: "apps/server/tsconfig.json",
        causes: expect.arrayContaining([serverTargetCause]),
      }),
    );
    expect(plan.mergeRequirements).toContainEqual({
      _tag: "tsconfig",
      path: "packages/domain/tsconfig.json",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
      ]),
    });
    expect(plan.warnings).toContainEqual(
      expect.objectContaining({
        _tag: "mergeStrategyRequired",
        path: "apps/server/tsconfig.json",
        message: "Existing tsconfig.json requires manual merge strategy.",
        requirement: expect.objectContaining({
          _tag: "tsconfig",
          path: "apps/server/tsconfig.json",
          causes: expect.arrayContaining([serverTargetCause]),
        }),
      }),
    );
    expect(plan.warnings).toContainEqual({
      _tag: "mergeStrategyRequired",
      path: "packages/domain/tsconfig.json",
      message: "Existing tsconfig.json requires manual merge strategy.",
      requirement: {
        _tag: "tsconfig",
        path: "packages/domain/tsconfig.json",
        causes: expect.arrayContaining([
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
        ]),
      },
    });
  });

  it("returns mixed successful and ambiguous paths through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-mixed-ambiguity-"));
    await mkdir(join(repoRoot, "apps/server"), { recursive: true });
    await mkdir(join(repoRoot, "packages/domain/src"), { recursive: true });
    await writeFile(
      join(repoRoot, "apps/server/tsconfig.json"),
      serverTsconfigContents,
    );
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          "./Api": {
            import: "./src/Api.ts",
          },
        },
        scripts: {
          clean:
            "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
          "type-check": "tsc --noEmit",
        },
        dependencies: {
          effect: "4.0.0-beta.47",
        },
        devDependencies: {
          "@repo/config-typescript": "workspace:*",
        },
      }),
    );
    await writeFile(
      join(repoRoot, "packages/domain/src/index.ts"),
      'export * from "./Api";\n',
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: [],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const impliedDomainApiCause = {
      _tag: "impliedTargetModule" as const,
      targetId: "packages/domain",
      moduleId: "domain-api",
      via: "required-target-module=>target-module:apps/server-api:http-api-server=>target-module:packages/domain:domain-api",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };
    const serverTargetCause = {
      _tag: "selectedTarget" as const,
      targetId: "apps/server-api",
    };
    const httpApiServerCause = {
      _tag: "impliedTargetModule" as const,
      targetId: "apps/server-api",
      moduleId: "http-api-server",
      via: "apps/server-api:http-api-server",
    };

    expect(plan.entries).toContainEqual(
      expect.objectContaining({
        _tag: "file",
        path: "apps/server/tsconfig.json",
        classification: "unchanged",
        causes: expect.arrayContaining([serverTargetCause]),
      }),
    );
    expect(plan.entries).toContainEqual(
      expect.objectContaining({
        _tag: "file",
        path: "apps/server/src/index.ts",
        classification: "create",
        causes: expect.arrayContaining([serverTargetCause, httpApiServerCause]),
      }),
    );
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "needsMergeStrategy",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/src/Api.ts",
      classification: "create",
      causes: [impliedDomainApiCause],
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/src/index.ts",
      classification: "unchanged",
      causes: [targetCompositionCause],
    });
    expect(plan.mergeRequirements).toStrictEqual([
      {
        _tag: "packageJsonExports",
        path: "packages/domain/package.json",
        exportKey: "./Api",
        causes: [targetCompositionCause],
      },
    ]);
    expect(plan.warnings).toStrictEqual([
      {
        _tag: "mergeStrategyRequired",
        path: "packages/domain/package.json",
        message: "Existing exports require manual merge strategy.",
        requirement: {
          _tag: "packageJsonExports",
          path: "packages/domain/package.json",
          exportKey: "./Api",
          causes: [targetCompositionCause],
        },
      },
    ]);
  });

  it("orders mixed target-driven planning outputs deterministically through the public entrypoint", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "scaffold-plan-ordering-"));
    await mkdir(join(repoRoot, "packages/domain/src"), { recursive: true });
    await mkdir(join(repoRoot, "apps/server"), { recursive: true });
    await writeFile(join(repoRoot, ".gitignore"), "node_modules\n");
    await writeFile(join(repoRoot, "package.json"), '{"private":false}');
    await writeFile(
      join(repoRoot, "packages/domain/package.json"),
      JSON.stringify({
        name: "@repo/domain",
        private: true,
        exports: {
          "./Api": {
            import: "./src/Api.ts",
          },
        },
        scripts: ["type-check"],
        dependencies: {
          effect: "4.0.0-beta.47",
        },
        devDependencies: {
          "@repo/config-typescript": "workspace:*",
        },
      }),
    );
    await writeFile(
      join(repoRoot, "packages/domain/src/index.ts"),
      'export * from "./Api";\nexport * from "./Rpc";\n',
    );
    await writeFile(
      join(repoRoot, "packages/domain/tsconfig.json"),
      packageDomainTsconfigContents,
    );
    await writeFile(
      join(repoRoot, "apps/server/package.json"),
      JSON.stringify({
        name: "server",
        version: "0.0.1",
        scripts: {
          dev: "bun --watch run src/index.ts",
        },
      }),
    );
    await writeFile(
      join(repoRoot, "apps/server/tsconfig.json"),
      serverTsconfigContents,
    );

    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [
            {
              identity: {
                kind: "server",
                name: "api",
              },
              modules: [{ id: "http-api-server" }],
              options: {},
            },
          ],
          modules: ["root-bootstrap"],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const typedPlan = decodePlan(plan);
    const serverTargetCause = {
      _tag: "selectedTarget" as const,
      targetId: "apps/server-api",
    };
    const httpApiServerCause = {
      _tag: "impliedTargetModule" as const,
      targetId: "apps/server-api",
      moduleId: "http-api-server",
      via: "apps/server-api:http-api-server",
    };
    const impliedCanonicalDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
    };
    const impliedOwningDomainTargetCause = {
      _tag: "impliedTarget" as const,
      targetId: "packages/domain",
      via: "required-owning-target=>target-module:packages/domain:domain-api=>target:packages/domain",
    };
    const impliedDomainApiCause = {
      _tag: "impliedTargetModule" as const,
      targetId: "packages/domain",
      moduleId: "domain-api",
      via: "required-target-module=>target-module:apps/server-api:http-api-server=>target-module:packages/domain:domain-api",
    };
    const targetCompositionCause = {
      _tag: "targetComposition" as const,
      targetId: "packages/domain",
      slot: "public-entrypoint",
      value: "./Api",
    };

    expect(typedPlan).toEqual(plan);
    expect(plan.entries.map((entry) => entry.path)).toStrictEqual([
      "apps",
      "apps/server",
      "apps/server/package.json",
      "apps/server/src",
      "apps/server/src/Api",
      "apps/server/src/Api/Health.ts",
      "apps/server/src/Api/Hello.ts",
      "apps/server/src/index.ts",
      "apps/server/tsconfig.json",
      "packages",
      "packages/domain",
      "packages/domain/package.json",
      "packages/domain/src",
      "packages/domain/src/Api.ts",
      "packages/domain/src/index.ts",
      "packages/domain/tsconfig.json",
    ]);
    expect(
      plan.tree.children.map((child) => ({
        _tag: child._tag,
        name: child.name,
        path: child.path,
      })),
    ).toStrictEqual([
      {
        _tag: "directory",
        name: "apps",
        path: "apps",
      },
      {
        _tag: "directory",
        name: "packages",
        path: "packages",
      },
    ]);
    expect(plan.tree.children[0]).toEqual(
      expect.objectContaining({
        _tag: "directory",
        name: "apps",
        path: "apps",
        causes: expect.arrayContaining([serverTargetCause, httpApiServerCause]),
      }),
    );
    expect(plan.tree.children[1]).toEqual(
      expect.objectContaining({
        _tag: "directory",
        name: "packages",
        path: "packages",
        causes: expect.arrayContaining([
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
          impliedDomainApiCause,
        ]),
      }),
    );
    expect(plan.entries).toContainEqual(
      expect.objectContaining({
        _tag: "file",
        path: "apps/server/package.json",
        classification: "modify",
        causes: expect.arrayContaining([serverTargetCause]),
      }),
    );
    expect(plan.entries).toContainEqual(
      expect.objectContaining({
        _tag: "file",
        path: "apps/server/tsconfig.json",
        classification: "unchanged",
        causes: expect.arrayContaining([serverTargetCause]),
      }),
    );
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/package.json",
      classification: "needsMergeStrategy",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
        targetCompositionCause,
      ]),
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/src/Api.ts",
      classification: "create",
      causes: [impliedDomainApiCause],
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/src/index.ts",
      classification: "unchanged",
      causes: [targetCompositionCause],
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/domain/tsconfig.json",
      classification: "unchanged",
      causes: expect.arrayContaining([
        impliedCanonicalDomainTargetCause,
        impliedOwningDomainTargetCause,
      ]),
    });
    expect(plan.mergeRequirements).toStrictEqual([
      {
        _tag: "packageJsonExports",
        path: "packages/domain/package.json",
        exportKey: "./Api",
        causes: [targetCompositionCause],
      },
      {
        _tag: "packageJsonScripts",
        path: "packages/domain/package.json",
        scriptName: "clean",
        causes: [
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
        ],
      },
      {
        _tag: "packageJsonScripts",
        path: "packages/domain/package.json",
        scriptName: "type-check",
        causes: [
          impliedCanonicalDomainTargetCause,
          impliedOwningDomainTargetCause,
        ],
      },
    ]);
    expect(plan.warnings).toStrictEqual([
      {
        _tag: "mergeStrategyRequired",
        path: "packages/domain/package.json",
        message: "Existing exports require manual merge strategy.",
        requirement: {
          _tag: "packageJsonExports",
          path: "packages/domain/package.json",
          exportKey: "./Api",
          causes: [targetCompositionCause],
        },
      },
      {
        _tag: "mergeStrategyRequired",
        path: "packages/domain/package.json",
        message: "Existing scripts require manual merge strategy.",
        requirement: {
          _tag: "packageJsonScripts",
          path: "packages/domain/package.json",
          scriptName: "clean",
          causes: [
            impliedCanonicalDomainTargetCause,
            impliedOwningDomainTargetCause,
          ],
        },
      },
      {
        _tag: "mergeStrategyRequired",
        path: "packages/domain/package.json",
        message: "Existing scripts require manual merge strategy.",
        requirement: {
          _tag: "packageJsonScripts",
          path: "packages/domain/package.json",
          scriptName: "type-check",
          causes: [
            impliedCanonicalDomainTargetCause,
            impliedOwningDomainTargetCause,
          ],
        },
      },
    ]);
  });

  it("builds a deterministic empty-repo root bootstrap plan through the public entrypoint", async () => {
    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const repoRoot = yield* Effect.tryPromise(() =>
          mkdtemp(join(tmpdir(), "scaffold-bootstrap-")),
        );
        const blueprint = yield* blueprintService.resolve({
          targets: [],
          modules: ["root-bootstrap"],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const typedPlan = decodePlan(plan);
    const rootBootstrapCause = {
      _tag: "selectedRepoModule" as const,
      moduleId: "root-bootstrap",
    };

    expect(typedPlan).toEqual(plan);
    expect(plan.entries).toStrictEqual([
      {
        _tag: "file",
        path: ".gitignore",
        classification: "create",
        causes: [rootBootstrapCause],
      },
      {
        _tag: "file",
        path: "package.json",
        classification: "create",
        causes: [rootBootstrapCause],
      },
      {
        _tag: "directory",
        path: "packages",
        causes: [rootBootstrapCause],
      },
      {
        _tag: "directory",
        path: "packages/config-typescript",
        causes: [rootBootstrapCause],
      },
      {
        _tag: "file",
        path: "packages/config-typescript/base.json",
        classification: "create",
        causes: [rootBootstrapCause],
      },
      {
        _tag: "file",
        path: "turbo.json",
        classification: "create",
        causes: [rootBootstrapCause],
      },
    ]);
    expect(plan.tree).toStrictEqual({
      _tag: "directory",
      name: ".",
      path: ".",
      causes: [rootBootstrapCause],
      children: [
        {
          _tag: "directory",
          name: "packages",
          path: "packages",
          causes: [rootBootstrapCause],
          children: [
            {
              _tag: "directory",
              name: "config-typescript",
              path: "packages/config-typescript",
              causes: [rootBootstrapCause],
              children: [
                {
                  _tag: "file",
                  name: "base.json",
                  path: "packages/config-typescript/base.json",
                  classification: "create",
                  causes: [rootBootstrapCause],
                },
              ],
            },
          ],
        },
        {
          _tag: "file",
          name: ".gitignore",
          path: ".gitignore",
          classification: "create",
          causes: [rootBootstrapCause],
        },
        {
          _tag: "file",
          name: "package.json",
          path: "package.json",
          classification: "create",
          causes: [rootBootstrapCause],
        },
        {
          _tag: "file",
          name: "turbo.json",
          path: "turbo.json",
          classification: "create",
          causes: [rootBootstrapCause],
        },
      ],
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("classifies root bootstrap files in a non-empty repo through the public entrypoint", async () => {
    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const repoRoot = yield* Effect.tryPromise(() =>
          mkdtemp(join(tmpdir(), "scaffold-bootstrap-existing-")),
        );

        yield* Effect.tryPromise(() =>
          writeFile(join(repoRoot, ".gitignore"), "node_modules\n"),
        );
        yield* Effect.tryPromise(() =>
          writeFile(join(repoRoot, "package.json"), '{"private":false}'),
        );
        yield* Effect.tryPromise(() =>
          writeFile(join(repoRoot, "README.md"), "existing\n"),
        );

        const blueprint = yield* blueprintService.resolve({
          targets: [],
          modules: ["root-bootstrap"],
          options: {},
        } satisfies typeof Selection.Type);

        return yield* PlanService.build({ blueprint, repoRoot });
      }).pipe(Effect.provide(BlueprintService.layer)),
    );

    const typedPlan = decodePlan(plan);
    const rootBootstrapCause = {
      _tag: "selectedRepoModule" as const,
      moduleId: "root-bootstrap",
    };

    expect(typedPlan).toEqual(plan);
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: ".gitignore",
      classification: "unchanged",
      causes: [rootBootstrapCause],
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "package.json",
      classification: "modify",
      causes: [rootBootstrapCause],
    });
    expect(plan.entries).toContainEqual({
      _tag: "file",
      path: "packages/config-typescript/base.json",
      classification: "create",
      causes: [rootBootstrapCause],
    });
    expect(plan.tree).toStrictEqual({
      _tag: "directory",
      name: ".",
      path: ".",
      causes: [rootBootstrapCause],
      children: [
        {
          _tag: "directory",
          name: "packages",
          path: "packages",
          causes: [rootBootstrapCause],
          children: [
            {
              _tag: "directory",
              name: "config-typescript",
              path: "packages/config-typescript",
              causes: [rootBootstrapCause],
              children: [
                {
                  _tag: "file",
                  name: "base.json",
                  path: "packages/config-typescript/base.json",
                  classification: "create",
                  causes: [rootBootstrapCause],
                },
              ],
            },
          ],
        },
        {
          _tag: "file",
          name: ".gitignore",
          path: ".gitignore",
          classification: "unchanged",
          causes: [rootBootstrapCause],
        },
        {
          _tag: "file",
          name: "package.json",
          path: "package.json",
          classification: "modify",
          causes: [rootBootstrapCause],
        },
        {
          _tag: "file",
          name: "turbo.json",
          path: "turbo.json",
          classification: "create",
          causes: [rootBootstrapCause],
        },
      ],
    });
    expect(plan.mergeRequirements).toStrictEqual([]);
    expect(plan.warnings).toStrictEqual([]);
  });

  it("rejects projected files that already exist as directories through the public entrypoint", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const repoRoot = yield* Effect.tryPromise(() =>
            mkdtemp(join(tmpdir(), "scaffold-bootstrap-collision-")),
          );

          yield* Effect.tryPromise(() => mkdir(join(repoRoot, "package.json")));

          const blueprint = yield* blueprintService.resolve({
            targets: [],
            modules: ["root-bootstrap"],
            options: {},
          } satisfies typeof Selection.Type);

          return yield* PlanService.build({ blueprint, repoRoot });
        }).pipe(Effect.provide(BlueprintService.layer)),
      ),
    ).rejects.toMatchObject({
      _tag: "PlanFailure",
      reason: "repoRootNotEmpty",
    } satisfies { _tag: string; reason: string });
  });
});
