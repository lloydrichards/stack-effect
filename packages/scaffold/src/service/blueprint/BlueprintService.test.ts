import assert from "node:assert/strict";
import { describe, expect, layer } from "@effect/vitest";
import {
  type Blueprint,
  BlueprintFailure,
  CatalogNotFound,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import {
  DddArchitecture,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Cause, Effect, Exit } from "effect";
import { BlueprintService } from "./BlueprintService";

const domainIdentity = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "domain",
});
const serverApiIdentity = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "api",
});
const dbIdentity = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "db",
});

const getNode = (blueprint: typeof Blueprint.Type, id: string) => {
  const node = blueprint.nodes.find((candidate) => candidate.id === id);
  assert(node !== undefined, `Expected blueprint node ${id} to exist`);
  return node;
};

const squashFailure = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true);
  assert(Exit.isFailure(exit), "Expected effect to fail");
  return Cause.squash(exit.cause);
};

describe("BlueprintService", () => {
  layer(BlueprintService.layer)("resolve", (it) => {
    describe("when validating selections", () => {
      it.effect("should fail when the same target is selected twice", () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const exit = yield* Effect.exit(
            blueprintService.resolve({
              targets: [
                {
                  identity: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [],
                },
                {
                  identity: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [],
                },
              ],
            }),
          );
          const error = squashFailure(exit);

          expect(error).toBeInstanceOf(BlueprintFailure);
          expect(error).toMatchObject({
            message: "Duplicate target selection: apps/server-api",
          });
        }),
      );

      it.effect("should fail when the same module is selected twice", () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const exit = yield* Effect.exit(
            blueprintService.resolve({
              targets: [
                {
                  identity: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [
                    { id: ModuleId.make("server-http-api") },
                    { id: ModuleId.make("server-http-api") },
                  ],
                },
              ],
            }),
          );
          const error = squashFailure(exit);

          expect(error).toBeInstanceOf(BlueprintFailure);
          expect(error).toMatchObject({
            message:
              "Duplicate module selection: apps/server-api requires module server-http-api",
          });
        }),
      );

      it.effect(
        "should fail when a module is not supported by the selected target",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const exit = yield* Effect.exit(
              blueprintService.resolve({
                targets: [
                  {
                    identity: new TargetIdentity({
                      kind: TargetKind.make("package"),
                      name: "domain",
                    }),
                    modules: [{ id: ModuleId.make("server-http-api") }],
                  },
                ],
              }),
            );
            const error = squashFailure(exit);

            expect(error).toBeInstanceOf(BlueprintFailure);
            expect(error).toMatchObject({
              message:
                "Unsupported target-module combination: packages/domain requires module server-http-api",
            });
          }),
      );

      it.effect("should propagate a missing module catalog lookup", () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const exit = yield* Effect.exit(
            blueprintService.resolve({
              targets: [
                {
                  identity: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [
                    { id: ModuleId.make("missing-target-module") as never },
                  ],
                },
              ],
            }),
          );
          const error = squashFailure(exit);

          expect(error).toBeInstanceOf(CatalogNotFound);
          expect(error).toMatchObject({
            catalog: "module",
            entity: "module",
            id: "missing-target-module",
          });
        }),
      );

      it.effect(
        "should fail when incompatible modules resolve on one target",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const exit = yield* Effect.exit(
              blueprintService.resolve({
                targets: [
                  {
                    identity: new TargetIdentity({
                      kind: TargetKind.make("workspace"),
                      name: "root",
                    }),
                    modules: [
                      { id: ModuleId.make("workspace-quality-biome-format") },
                      { id: ModuleId.make("workspace-quality-oxfmt") },
                    ],
                  },
                ],
              }),
            );
            const error = squashFailure(exit);

            expect(error).toBeInstanceOf(BlueprintFailure);
            expect(error).toMatchObject({
              message:
                "Incompatible modules on .: workspace-quality-biome-format conflicts with workspace-quality-oxfmt",
            });
          }),
      );

      it.effect(
        "should allow compatible modules when they share a presentation category",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const blueprint = yield* blueprintService.resolve({
              targets: [
                {
                  identity: new TargetIdentity({
                    kind: TargetKind.make("workspace"),
                    name: "root",
                  }),
                  modules: [
                    { id: ModuleId.make("workspace-devenv-nix-flake") },
                    { id: ModuleId.make("workspace-devenv-devcontainer") },
                  ],
                },
              ],
            });

            expect(
              blueprint.nodes.filter(
                (node) =>
                  node._tag === "attached-module" && node.targetId === ".",
              ),
            ).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  moduleId: "workspace-devenv-nix-flake",
                }),
                expect.objectContaining({
                  moduleId: "workspace-devenv-devcontainer",
                }),
              ]),
            );
          }),
      );
    });

    describe("when resolving architecture variants", () => {
      it.effect("resolves the complete DDD Todo physical layout", () =>
        Effect.gen(function* () {
          const service = yield* BlueprintService;
          const blueprint = yield* service.resolve({
            targets: [
              {
                identity: new TargetIdentity({
                  kind: TargetKind.make("server"),
                  name: "api",
                }),
                architecture: DddArchitecture,
                modules: [
                  { id: ModuleId.make("server-http-api-todos") },
                  {
                    id: ModuleId.make("server-http-api-todos-provider-sqlite"),
                  },
                  {
                    id: ModuleId.make(
                      "server-http-api-todos-provider-postgres",
                    ),
                  },
                ],
              },
            ],
          });

          const dddTargets = blueprint.nodes
            .filter((node) => node._tag === "target")
            .filter((node) => node.identity.kind !== "workspace")
            .map((node) => ({
              id: node.id,
              architecture: node.architecture,
              path: node.layout.path,
              packageName: node.layout.packageName,
            }));
          expect(dddTargets).toHaveLength(6);
          expect(dddTargets).toEqual(
            expect.arrayContaining([
              {
                id: "apps/server-api",
                architecture: "ddd",
                path: "apps/server-api",
                packageName: "server-api",
              },
              {
                id: "packages/shared-domain",
                architecture: "ddd",
                path: "packages/shared/domain",
                packageName: "@repo/shared-domain",
              },
              {
                id: "packages/todo-domain",
                architecture: "ddd",
                path: "packages/todo/domain",
                packageName: "@repo/todo-domain",
              },
              {
                id: "packages/todo-application",
                architecture: "ddd",
                path: "packages/todo/application",
                packageName: "@repo/todo-application",
              },
              {
                id: "packages/todo-infrastructure",
                architecture: "ddd",
                path: "packages/todo/infrastructure",
                packageName: "@repo/todo-infrastructure",
              },
              {
                id: "packages/todo-presentation",
                architecture: "ddd",
                path: "packages/todo/presentation",
                packageName: "@repo/todo-presentation",
              },
            ]),
          );

          const closure = blueprint.nodes.map((node) =>
            node._tag === "target"
              ? node.identity.toKey()
              : `${node.targetId}:${node.moduleId}`,
          );
          expect(closure).not.toContain("apps/server-todo-api");
          expect(closure).not.toContain("package/db");
          expect(closure.some((key) => key.includes("db-sql"))).toBe(false);
          expect(closure.some((key) => key.includes("package-db"))).toBe(false);
          expect(
            closure.filter((key) => key.endsWith(":domain-todo-contracts")),
          ).toHaveLength(1);
          expect(
            getNode(
              blueprint,
              toAttachedModuleNodeId(
                serverApiIdentity.toKey(),
                ModuleId.make("server-http-api-todos-provider-sqlite"),
              ),
            ),
          ).toMatchObject({ targetId: "apps/server-api" });
          expect(
            getNode(
              blueprint,
              toAttachedModuleNodeId(
                serverApiIdentity.toKey(),
                ModuleId.make("server-http-api-todos-provider-postgres"),
              ),
            ),
          ).toMatchObject({ targetId: "apps/server-api" });
        }),
      );

      it.effect(
        "rejects Classic-only server modules with actionable DDD guidance",
        () =>
          Effect.gen(function* () {
            const service = yield* BlueprintService;
            const exit = yield* Effect.exit(
              service.resolve({
                targets: [
                  {
                    identity: new TargetIdentity({
                      kind: TargetKind.make("server"),
                      name: "todo-api",
                    }),
                    architecture: DddArchitecture,
                    modules: [{ id: ModuleId.make("server-http-rpc") }],
                  },
                ],
              }),
            );
            expect(squashFailure(exit)).toMatchObject({
              message: expect.stringContaining(
                "DDD currently supports only server/api with Todo HTTP",
              ),
            });
          }),
      );
    });

    describe("when resolving dependencies", () => {
      it.effect(
        "should resolve a required capability through one explicitly selected provider",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const blueprint = yield* blueprintService.resolve({
              targets: [
                {
                  identity: dbIdentity,
                  modules: [
                    { id: ModuleId.make("package-db-todo-repository") },
                    { id: ModuleId.make("package-db-sqlite") },
                  ],
                },
              ],
            });

            expect(
              getNode(
                blueprint,
                toAttachedModuleNodeId(
                  dbIdentity.toKey(),
                  ModuleId.make("package-db-sqlite"),
                ),
              ),
            ).toMatchObject({ moduleId: "package-db-sqlite" });
          }),
      );

      it.effect(
        "should not add Todo RPC contracts for an HTTP-only Todo selection",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const blueprint = yield* blueprintService.resolve({
              targets: [
                {
                  identity: serverApiIdentity,
                  modules: [
                    { id: ModuleId.make("server-http-rpc") },
                    { id: ModuleId.make("server-http-api-todos") },
                  ],
                },
                {
                  identity: dbIdentity,
                  modules: [{ id: ModuleId.make("package-db-sqlite") }],
                },
              ],
            });

            expect(
              blueprint.nodes.some(
                (node) =>
                  node._tag === "attached-module" &&
                  node.moduleId === "domain-todo-rpc-contracts",
              ),
            ).toBe(false);
          }),
      );

      it.effect(
        "should reject a required capability without exactly one selected provider",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const exit = yield* Effect.exit(
              blueprintService.resolve({
                targets: [
                  {
                    identity: dbIdentity,
                    modules: [
                      { id: ModuleId.make("package-db-todo-repository") },
                    ],
                  },
                ],
              }),
            );

            expect(squashFailure(exit)).toMatchObject({
              message: expect.stringContaining(
                "Select exactly one provider module explicitly",
              ),
            });
          }),
      );

      it.effect(
        "should reject a required capability with multiple selected providers",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const exit = yield* Effect.exit(
              blueprintService.resolve({
                targets: [
                  {
                    identity: dbIdentity,
                    modules: [
                      { id: ModuleId.make("package-db-todo-repository") },
                      { id: ModuleId.make("package-db-sqlite") },
                      { id: ModuleId.make("package-db-postgres") },
                    ],
                  },
                ],
              }),
            );

            expect(squashFailure(exit)).toMatchObject({
              message: expect.stringContaining(
                "Select exactly one provider module explicitly",
              ),
            });
          }),
      );

      it.effect(
        "should reject multiple providers even without a capability consumer",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const exit = yield* Effect.exit(
              blueprintService.resolve({
                targets: [
                  {
                    identity: dbIdentity,
                    modules: [
                      { id: ModuleId.make("package-db-sqlite") },
                      { id: ModuleId.make("package-db-postgres") },
                    ],
                  },
                ],
              }),
            );

            expect(squashFailure(exit)).toMatchObject({
              message: expect.stringContaining(
                "Multiple providers selected for capability db-sql",
              ),
            });
          }),
      );

      it.effect(
        "should imply required targets and modules when server-http-api is selected",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const blueprint = yield* blueprintService.resolve({
              targets: [
                {
                  identity: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [{ id: ModuleId.make("server-http-api") }],
                },
              ],
            });

            expect(getNode(blueprint, "apps/server-api")).toMatchObject({
              _tag: "target",
              id: "apps/server-api",
            });
            expect(getNode(blueprint, "packages/domain")).toMatchObject({
              _tag: "target",
              id: "packages/domain",
            });
            expect(
              getNode(
                blueprint,
                toAttachedModuleNodeId(
                  serverApiIdentity.toKey(),
                  ModuleId.make("server-http-api"),
                ),
              ),
            ).toMatchObject({
              _tag: "attached-module",
              targetId: "apps/server-api",
              moduleId: "server-http-api",
            });
            expect(
              getNode(
                blueprint,
                toAttachedModuleNodeId(
                  domainIdentity.toKey(),
                  ModuleId.make("domain-api-contracts"),
                ),
              ),
            ).toMatchObject({
              _tag: "attached-module",
              targetId: "packages/domain",
              moduleId: "domain-api-contracts",
            });
            expect(blueprint.edges).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: `owns-module=>apps/server-api=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("server-http-api"))}`,
                  reason: "owns-module",
                }),
                expect.objectContaining({
                  id: `owns-module=>packages/domain=>${toAttachedModuleNodeId(domainIdentity.toKey(), ModuleId.make("domain-api-contracts"))}`,
                  reason: "owns-module",
                }),
                expect.objectContaining({
                  id: `required-target=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("server-http-api"))}=>packages/domain`,
                  reason: "required-target",
                }),
                expect.objectContaining({
                  id: `required-module=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("server-http-api"))}=>${toAttachedModuleNodeId(domainIdentity.toKey(), ModuleId.make("domain-api-contracts"))}`,
                  reason: "required-module",
                }),
              ]),
            );
          }),
      );

      it.effect(
        "should resolve same-kind required modules on the selected target",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const cliCustomIdentity = new TargetIdentity({
              kind: TargetKind.make("cli"),
              name: "custom",
            });
            const blueprint = yield* blueprintService.resolve({
              targets: [
                {
                  identity: cliCustomIdentity,
                  modules: [{ id: ModuleId.make("cli-command-chat-terminal") }],
                },
              ],
            });

            expect(getNode(blueprint, "apps/cli-custom")).toMatchObject({
              _tag: "target",
              id: "apps/cli-custom",
            });
            expect(
              blueprint.nodes.some((node) => node.id === "apps/cli-app"),
            ).toBe(false);
            expect(
              getNode(
                blueprint,
                toAttachedModuleNodeId(
                  cliCustomIdentity.toKey(),
                  ModuleId.make("cli-chat-driver"),
                ),
              ),
            ).toMatchObject({
              _tag: "attached-module",
              targetId: "apps/cli-custom",
              moduleId: "cli-chat-driver",
            });
          }),
      );

      it.effect(
        "should keep distinct target ids when app kinds share the same name",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const blueprint = yield* blueprintService.resolve({
              targets: [
                {
                  identity: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [],
                },
                {
                  identity: new TargetIdentity({
                    kind: TargetKind.make("client-react"),
                    name: "api",
                  }),
                  modules: [],
                },
              ],
            });

            // NOTE: This fixture checks the transitive module requirement chain.
            expect(
              blueprint.nodes
                .filter((node) => node._tag === "target")
                .map((node) => node.id),
            ).toEqual([
              "apps/client-react-api",
              "apps/server-api",
              "packages/domain",
            ]);
          }),
      );

      it.effect(
        "should resolve the config-typescript-vite module on client selections",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const blueprint = yield* blueprintService.resolve({
              targets: [
                {
                  identity: new TargetIdentity({
                    kind: TargetKind.make("client-react"),
                    name: "app",
                  }),
                  modules: [{ id: ModuleId.make("config-typescript-vite") }],
                },
              ],
            });

            expect(
              getNode(
                blueprint,
                toAttachedModuleNodeId(
                  new TargetIdentity({
                    kind: TargetKind.make("client-react"),
                    name: "app",
                  }).toKey(),
                  ModuleId.make("config-typescript-vite"),
                ),
              ),
            ).toMatchObject({
              _tag: "attached-module",
              targetId: "apps/client-react-app",
              moduleId: "config-typescript-vite",
            });
          }),
      );

      it.effect(
        "should attach target-required modules for client even when none are selected",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const identity = new TargetIdentity({
              kind: TargetKind.make("client-react"),
              name: "required",
            });
            const blueprint = yield* blueprintService.resolve({
              targets: [{ identity, modules: [] }],
            });

            expect(
              getNode(
                blueprint,
                toAttachedModuleNodeId(
                  identity.toKey(),
                  ModuleId.make("config-typescript-vite"),
                ),
              ),
            ).toMatchObject({
              _tag: "attached-module",
              targetId: "apps/client-react-required",
              moduleId: "config-typescript-vite",
            });
          }),
      );
    });
  });
});
