import assert from "node:assert/strict";
import { describe, expect, layer } from "@effect/vitest";
import {
  type Blueprint,
  BlueprintFailure,
  CatalogNotFound,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
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
    });

    describe("when resolving dependencies", () => {
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

            // Server requires server-http-api which requires domain-api-contracts on packages/domain
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
