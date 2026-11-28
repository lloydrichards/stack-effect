import { assert, describe, it, layer } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { CatalogReader } from "@repo/catalog/Catalog";
import {
  type Blueprint,
  makeBlueprintEdge,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/StackConfig";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { Effect, Layer, Schema } from "effect";
import {
  module,
  ProviderCatalogLayer,
  selected,
  target,
} from "./fixtures/scaffold";

describe("BlueprintResolver", () => {
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

  const getNode = (blueprint: Blueprint, id: string) => {
    const node = blueprint.nodes.find((candidate) => candidate.id === id);
    assert.isDefined(node, `Expected blueprint node ${id} to exist`);
    return node;
  };

  const getAttachedModule = (blueprint: Blueprint, id: string) => {
    const node = getNode(blueprint, id);
    assert(
      node._tag === "attached-module",
      `Expected blueprint node ${id} to be an attached module`,
    );
    return node;
  };

  const denoConfig = new StackConfig({
    name: Schema.NonEmptyString.make("deno-project"),
    runtime: { _tag: "deno" },
    typescript: "6",
  });

  const TestLayer = BlueprintResolver.layer.pipe(
    Layer.provide(OfficialCatalogLayer),
  );

  it.effect(
    "matches a required target to the named app even on the same kind",
    () =>
      Effect.gen(function* () {
        const blueprints = yield* BlueprintResolver;
        const namedApi = new TargetIdentity({
          kind: serverApiIdentity.kind,
          name: serverApiIdentity.name,
        });
        const backoffice = new TargetIdentity({
          kind: serverApiIdentity.kind,
          name: "backoffice",
        });
        const source = selected("server", "admin", "server-requires-api");
        const blueprint = yield* blueprints.resolve({
          targets: [source, { identity: namedApi, modules: [] }],
        });

        assert.includeDeepMembers(
          [...blueprint.edges],
          [
            makeBlueprintEdge(
              "required-target",
              toAttachedModuleNodeId(
                source.identity.toKey(),
                ModuleId.make("server-requires-api"),
              ),
              namedApi.toKey(),
            ),
          ],
        );
        const dependency = getNode(blueprint, backoffice.toKey());
        assert(dependency._tag === "target");
        assert.strictEqual(dependency.identity.toPath(), "apps/backoffice");
        const replay = yield* blueprints.resolve({
          targets: [
            source,
            { identity: namedApi, modules: [] },
            { identity: backoffice, modules: [] },
          ],
        });
        assert.deepStrictEqual(replay, blueprint);
      }).pipe(
        Effect.provide(
          BlueprintResolver.layer.pipe(
            Layer.provide(
              CatalogReader.fromFragments([
                {
                  targets: [target("server", { defaultName: "api" })],
                  modules: [
                    module("server-requires-api", "server", {
                      dependencies: [
                        {
                          _tag: "required-target",
                          identity: serverApiIdentity,
                        },
                        {
                          _tag: "required-target",
                          identity: new TargetIdentity({
                            kind: serverApiIdentity.kind,
                            name: "backoffice",
                          }),
                        },
                      ],
                    }),
                  ],
                },
              ]),
            ),
          ),
        ),
      ),
  );

  layer(TestLayer)("resolve", (it) => {
    describe("when validating selections", () => {
      for (const names of [["sdk-client", "sdk/client"]]) {
        it.effect(
          `should reject a shared package name when ${names.join(" and ")} are selected`,
          () =>
            Effect.gen(function* () {
              const blueprintResolver = yield* BlueprintResolver;
              const [first, second] = names.map((name) =>
                selected("package", name),
              );
              assert.isDefined(first);
              assert.isDefined(second);
              yield* blueprintResolver.resolve({
                targets: [first, selected("package", "unrelated")],
              });
              const error = yield* Effect.flip(
                blueprintResolver.resolve({ targets: [first, second] }),
              );

              assert.strictEqual(error._tag, "BlueprintError");
            }),
        );
      }

      it.effect("should fail when the same target is selected twice", () =>
        Effect.gen(function* () {
          const blueprintResolver = yield* BlueprintResolver;
          const target = {
            identity: new TargetIdentity({
              kind: TargetKind.make("server"),
              name: "api",
            }),
            modules: [],
          };
          yield* blueprintResolver.resolve({ targets: [target] });
          const error = yield* Effect.flip(
            blueprintResolver.resolve({ targets: [target, target] }),
          );

          assert.strictEqual(error._tag, "BlueprintError");
        }),
      );

      it.effect("should fail when the same module is selected twice", () =>
        Effect.gen(function* () {
          const blueprintResolver = yield* BlueprintResolver;
          const identity = new TargetIdentity({
            kind: TargetKind.make("server"),
            name: "api",
          });
          const module = { id: ModuleId.make("server-http-api") };
          yield* blueprintResolver.resolve({
            targets: [{ identity, modules: [module] }],
          });
          const error = yield* Effect.flip(
            blueprintResolver.resolve({
              targets: [{ identity, modules: [module, module] }],
            }),
          );

          assert.strictEqual(error._tag, "BlueprintError");
        }),
      );

      it.effect(
        "should fail when a module is not supported by the selected target",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const error = yield* Effect.flip(
              blueprintResolver.resolve({
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

            assert.strictEqual(error._tag, "BlueprintError");
            assert.include(
              error.message,
              "Unsupported target-module combination",
            );
            assert.include(error.message, "package/domain");
            assert.include(error.message, "server-http-api");
          }),
      );

      it.effect("should propagate a missing module catalog lookup", () =>
        Effect.gen(function* () {
          const blueprintResolver = yield* BlueprintResolver;
          const error = yield* Effect.flip(
            blueprintResolver.resolve({
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

          assert(error._tag === "CatalogNotFound");
          assert.strictEqual(error.catalog, "module");
          assert.strictEqual(error.entity, "module");
          assert.strictEqual(error.id, "missing-target-module");
        }),
      );

      it.effect(
        "should fail when incompatible modules resolve on one target",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const first = "workspace-quality-biome-format";
            const second = "workspace-quality-oxfmt";
            yield* blueprintResolver.resolve({
              targets: [selected("workspace", "root", first)],
            });
            yield* blueprintResolver.resolve({
              targets: [selected("workspace", "root", second)],
            });
            const error = yield* Effect.flip(
              blueprintResolver.resolve({
                targets: [selected("workspace", "root", first, second)],
              }),
            );

            assert.strictEqual(error._tag, "BlueprintError");
          }),
      );

      it.effect(
        "should allow compatible modules when they share a presentation category",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const blueprint = yield* blueprintResolver.resolve({
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

            const rootModuleIds = blueprint.nodes.flatMap((node) =>
              node._tag === "attached-module" && node.targetId === "."
                ? [node.moduleId]
                : [],
            );
            assert.includeMembers(rootModuleIds, [
              "workspace-devenv-nix-flake",
              "workspace-devenv-devcontainer",
            ]);
          }),
      );
    });

    describe("when resolving dependencies", () => {
      it.effect(
        "should resolve the same dependency graph for identical selections",
        () =>
          Effect.gen(function* () {
            const resolver = yield* BlueprintResolver;
            const input = {
              targets: [selected("server", "api", "server-http-api")],
            };
            const blueprint = yield* resolver.resolve(input);

            assert.isNotEmpty(blueprint.edges);
            assert.deepStrictEqual(yield* resolver.resolve(input), blueprint);
          }),
      );

      it.effect(
        "should resolve a required capability through one explicitly selected provider",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const blueprint = yield* blueprintResolver.resolve({
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

            const consumer = toAttachedModuleNodeId(
              dbIdentity.toKey(),
              ModuleId.make("package-db-todo-repository"),
            );
            const provider = toAttachedModuleNodeId(
              dbIdentity.toKey(),
              ModuleId.make("package-db-sqlite"),
            );

            assert.includeDeepMembers(
              [...blueprint.edges],
              [
                makeBlueprintEdge(
                  "required-target",
                  consumer,
                  dbIdentity.toKey(),
                ),
                makeBlueprintEdge("required-module", consumer, provider),
              ],
            );
          }),
      );

      it.effect(
        "should not add Todo RPC contracts for an HTTP-only Todo selection",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const blueprint = yield* blueprintResolver.resolve({
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

            assert.isFalse(
              blueprint.nodes.some(
                (node) =>
                  node._tag === "attached-module" &&
                  node.moduleId === "domain-todo-rpc-contracts",
              ),
            );
          }),
      );

      it.effect(
        "should reject a required capability without exactly one selected provider",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const error = yield* Effect.flip(
              blueprintResolver.resolve({
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

            assert.strictEqual(error._tag, "BlueprintError");
            assert.include(
              error.message,
              "Select exactly one provider module explicitly",
            );
          }),
      );

      it.effect(
        "should reject a required capability with multiple selected providers",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const error = yield* Effect.flip(
              blueprintResolver.resolve({
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

            assert.strictEqual(error._tag, "BlueprintError");
            assert.include(
              error.message,
              "Select exactly one provider module explicitly",
            );
          }),
      );

      it.effect(
        "should reject multiple providers even without a capability consumer",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const error = yield* Effect.flip(
              blueprintResolver.resolve({
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

            assert.strictEqual(error._tag, "BlueprintError");
            assert.include(
              error.message,
              "Multiple providers selected for capability db-sql",
            );
          }),
      );

      it.effect(
        "should imply required targets and modules when server-http-api is selected",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const blueprint = yield* blueprintResolver.resolve({
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

            assert.strictEqual(getNode(blueprint, "server/api")._tag, "target");
            assert.strictEqual(
              getNode(blueprint, "package/domain")._tag,
              "target",
            );
            const serverHttpApiNode = getAttachedModule(
              blueprint,
              toAttachedModuleNodeId(
                serverApiIdentity.toKey(),
                ModuleId.make("server-http-api"),
              ),
            );
            assert.strictEqual(serverHttpApiNode.targetId, "server/api");
            assert.strictEqual(serverHttpApiNode.moduleId, "server-http-api");
            const domainApiContractsNode = getAttachedModule(
              blueprint,
              toAttachedModuleNodeId(
                domainIdentity.toKey(),
                ModuleId.make("domain-api-contracts"),
              ),
            );
            assert.strictEqual(
              domainApiContractsNode.targetId,
              "package/domain",
            );
            assert.strictEqual(
              domainApiContractsNode.moduleId,
              "domain-api-contracts",
            );
            const serverHttpApi = toAttachedModuleNodeId(
              serverApiIdentity.toKey(),
              ModuleId.make("server-http-api"),
            );
            const domainApiContracts = toAttachedModuleNodeId(
              domainIdentity.toKey(),
              ModuleId.make("domain-api-contracts"),
            );
            assert.includeDeepMembers(
              [...blueprint.edges],
              [
                makeBlueprintEdge(
                  "owns-module",
                  serverApiIdentity.toKey(),
                  serverHttpApi,
                ),
                makeBlueprintEdge(
                  "owns-module",
                  domainIdentity.toKey(),
                  domainApiContracts,
                ),
                makeBlueprintEdge(
                  "required-target",
                  serverHttpApi,
                  domainIdentity.toKey(),
                ),
                makeBlueprintEdge(
                  "required-module",
                  serverHttpApi,
                  domainApiContracts,
                ),
              ],
            );
          }),
      );

      it.effect(
        "should resolve same-kind required modules on the selected target",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const cliCustomIdentity = new TargetIdentity({
              kind: TargetKind.make("cli"),
              name: "sdk/custom",
            });
            const blueprint = yield* blueprintResolver.resolve({
              targets: [
                {
                  identity: cliCustomIdentity,
                  modules: [{ id: ModuleId.make("cli-command-chat-terminal") }],
                },
              ],
            });

            assert.strictEqual(
              getNode(blueprint, "cli/sdk/custom")._tag,
              "target",
            );
            assert.isFalse(
              blueprint.nodes.some((node) => node.id === "cli/app"),
            );
            const cliChatDriverNode = getAttachedModule(
              blueprint,
              toAttachedModuleNodeId(
                cliCustomIdentity.toKey(),
                ModuleId.make("cli-chat-driver"),
              ),
            );
            assert.strictEqual(cliChatDriverNode.targetId, "cli/sdk/custom");
            assert.strictEqual(cliChatDriverNode.moduleId, "cli-chat-driver");
          }),
      );

      it.effect(
        "should keep distinct target ids when app kinds share the same name",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const blueprint = yield* blueprintResolver.resolve({
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
            assert.deepStrictEqual(
              blueprint.nodes
                .filter((node) => node._tag === "target")
                .map((node) => node.id),
              ["client-react/api", "package/domain", "server/api"],
            );
          }),
      );

      it.effect(
        "should resolve the config-typescript-vite module on client selections",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const blueprint = yield* blueprintResolver.resolve({
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

            const configTypescriptViteNode = getAttachedModule(
              blueprint,
              toAttachedModuleNodeId(
                new TargetIdentity({
                  kind: TargetKind.make("client-react"),
                  name: "app",
                }).toKey(),
                ModuleId.make("config-typescript-vite"),
              ),
            );
            assert.strictEqual(
              configTypescriptViteNode.targetId,
              "client-react/app",
            );
            assert.strictEqual(
              configTypescriptViteNode.moduleId,
              "config-typescript-vite",
            );
          }),
      );

      it.effect(
        "should attach target-required modules for client even when none are selected",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const identity = new TargetIdentity({
              kind: TargetKind.make("client-react"),
              name: "required",
            });
            const blueprint = yield* blueprintResolver.resolve({
              targets: [{ identity, modules: [] }],
            });

            const configTypescriptViteNode = getAttachedModule(
              blueprint,
              toAttachedModuleNodeId(
                identity.toKey(),
                ModuleId.make("config-typescript-vite"),
              ),
            );
            assert.strictEqual(
              configTypescriptViteNode.targetId,
              "client-react/required",
            );
            assert.strictEqual(
              configTypescriptViteNode.moduleId,
              "config-typescript-vite",
            );
          }),
      );

      it.effect(
        "should resolve a supported Deno server and its dependencies",
        () =>
          Effect.gen(function* () {
            const blueprintResolver = yield* BlueprintResolver;
            const blueprint = yield* blueprintResolver.resolve(
              {
                targets: [
                  {
                    identity: serverApiIdentity,
                    modules: [],
                  },
                ],
              },
              denoConfig,
            );

            assert.strictEqual(
              getAttachedModule(
                blueprint,
                toAttachedModuleNodeId(
                  domainIdentity.toKey(),
                  ModuleId.make("domain-api-contracts"),
                ),
              ).moduleId,
              "domain-api-contracts",
            );
          }),
      );

      it.effect("should resolve a Deno client and its Vite dependency", () =>
        Effect.gen(function* () {
          const blueprintResolver = yield* BlueprintResolver;
          const client = new TargetIdentity({
            kind: TargetKind.make("client-react"),
            name: "web",
          });
          const blueprint = yield* blueprintResolver.resolve(
            { targets: [{ identity: client, modules: [] }] },
            denoConfig,
          );

          assert.strictEqual(
            getAttachedModule(
              blueprint,
              toAttachedModuleNodeId(
                client.toKey(),
                ModuleId.make("config-typescript-vite"),
              ),
            ).moduleId,
            "config-typescript-vite",
          );
        }),
      );

      it.effect("should reject Turbo for Deno before planning", () =>
        Effect.gen(function* () {
          const blueprintResolver = yield* BlueprintResolver;
          const failure = yield* Effect.flip(
            blueprintResolver.resolve(
              {
                targets: [
                  {
                    identity: new TargetIdentity({
                      kind: TargetKind.make("workspace"),
                      name: "deno-project",
                    }),
                    modules: [
                      { id: ModuleId.make("workspace-monorepo-turbo") },
                    ],
                  },
                ],
              },
              denoConfig,
            ),
          );

          assert.strictEqual(failure._tag, "BlueprintError");
          assert.include(failure.message, "deno");
          assert.include(failure.message, "workspace-monorepo-turbo");
        }),
      );
    });
  });

  it.effect(
    "should reject a capability dependency when its target was not selected",
    () =>
      Effect.gen(function* () {
        const blueprintResolver = yield* BlueprintResolver;
        const consumer = selected("package", "app", "todo-repository");
        const provider = selected("package", "db", "sql-sqlite");
        const accepted = yield* blueprintResolver.resolve({
          targets: [consumer, provider],
        });
        const error = yield* Effect.flip(
          blueprintResolver.resolve({ targets: [consumer] }),
        );

        assert.includeDeepMembers(
          [...accepted.edges],
          [
            makeBlueprintEdge(
              "required-module",
              toAttachedModuleNodeId(
                consumer.identity.toKey(),
                ModuleId.make("todo-repository"),
              ),
              toAttachedModuleNodeId(
                provider.identity.toKey(),
                ModuleId.make("sql-sqlite"),
              ),
            ),
          ],
        );
        assert.strictEqual(error._tag, "BlueprintError");
      }).pipe(
        Effect.provide(
          BlueprintResolver.layer.pipe(Layer.provide(ProviderCatalogLayer)),
        ),
      ),
  );

  it.effect(
    "should reject an unsupported runtime even when the target has no modules",
    () =>
      Effect.gen(function* () {
        const blueprintResolver = yield* BlueprintResolver;
        const app = selected("server", "api");
        const selection = { targets: [app] };
        const bunConfig = new StackConfig({
          ...denoConfig,
          runtime: { _tag: "bun" },
        });
        const blueprint = yield* blueprintResolver.resolve(
          selection,
          bunConfig,
        );
        const error = yield* Effect.flip(
          blueprintResolver.resolve(selection, denoConfig),
        );

        assert.strictEqual(
          getNode(blueprint, app.identity.toKey())._tag,
          "target",
        );
        assert.strictEqual(error._tag, "BlueprintError");
      }).pipe(
        Effect.provide(
          BlueprintResolver.layer.pipe(
            Layer.provide(
              CatalogReader.fromFragments([
                {
                  targets: [target("server", { supportedRuntimes: ["bun"] })],
                  modules: [],
                },
              ]),
            ),
          ),
        ),
      ),
  );
});
