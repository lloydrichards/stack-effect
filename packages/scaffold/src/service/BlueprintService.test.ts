import assert from "node:assert/strict";
import { describe, expect, layer } from "@effect/vitest";
import {
  type Blueprint,
  BlueprintFailure,
  CatalogNotFound,
  toModuleNodeId,
} from "@repo/domain/Blueprint";
import { Effect } from "effect";
import { BlueprintService } from "./BlueprintService";

const getNode = (blueprint: Blueprint, id: string) => {
  const node = blueprint.nodes.find((candidate) => candidate.id === id);
  assert(node !== undefined, `Expected blueprint node ${id} to exist`);
  return node;
};

describe("BlueprintService", () => {
  layer(BlueprintService.layer)("resolve", (it) => {
    describe("when validating selections", () => {
      it.effect("should fail when the same target is selected twice", () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const error = yield* Effect.flip(
            blueprintService.resolve({
              targets: [
                {
                  identity: {
                    kind: "server",
                    name: "api",
                  },
                  modules: [],
                  options: {},
                },
                {
                  identity: {
                    kind: "server",
                    name: "api",
                  },
                  modules: [],
                  options: {},
                },
              ],
            }),
          );

          expect(error).toBeInstanceOf(BlueprintFailure);
          expect(error).toMatchObject({
            message: "Duplicate target selection: apps/server-api",
          });
        }),
      );

      it.effect("should fail when the same module is selected twice", () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const error = yield* Effect.flip(
            blueprintService.resolve({
              targets: [
                {
                  identity: {
                    kind: "server",
                    name: "api",
                  },
                  modules: [
                    { id: "http-api-server" },
                    { id: "http-api-server" },
                  ],
                  options: {},
                },
              ],
            }),
          );

          expect(error).toBeInstanceOf(BlueprintFailure);
          expect(error).toMatchObject({
            message:
              "Duplicate module selection: apps/server-api requires module http-api-server",
          });
        }),
      );

      it.effect(
        "should fail when a module is not supported by the selected target",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const error = yield* Effect.flip(
              blueprintService.resolve({
                targets: [
                  {
                    identity: {
                      kind: "package",
                      name: "domain",
                    },
                    modules: [{ id: "http-api-server" }],
                    options: {},
                  },
                ],
              }),
            );

            expect(error).toBeInstanceOf(BlueprintFailure);
            expect(error).toMatchObject({
              message:
                "Unsupported target-module combination: packages/domain requires module http-api-server",
            });
          }),
      );

      it.effect("should propagate a missing module catalog lookup", () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const error = yield* Effect.flip(
            blueprintService.resolve({
              targets: [
                {
                  identity: {
                    kind: "server",
                    name: "api",
                  },
                  modules: [{ id: "missing-target-module" as never }],
                  options: {},
                },
              ],
            }),
          );

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
        "should imply required targets and modules when http-api-server is selected",
        () =>
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
            });

            const server = getNode(blueprint, "apps/server-api");
            const domain = getNode(blueprint, "packages/domain");

            expect(server.modules).toEqual([{ moduleId: "http-api-server" }]);
            expect(domain.modules).toEqual([{ moduleId: "domain-api" }]);
            expect(blueprint.edges).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: `required-target=>${toModuleNodeId("apps/server-api", "http-api-server")}=>packages/domain`,
                  reason: "required-target",
                }),
                expect.objectContaining({
                  id: `required-module=>${toModuleNodeId("apps/server-api", "http-api-server")}=>${toModuleNodeId("packages/domain", "domain-api")}`,
                  reason: "required-module",
                }),
              ]),
            );
            expect(blueprint.roots).toEqual([
              "apps/server-api",
              toModuleNodeId("apps/server-api", "http-api-server"),
            ]);
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
                  identity: {
                    kind: "server",
                    name: "api",
                  },
                  modules: [],
                  options: {},
                },
                {
                  identity: {
                    kind: "client",
                    name: "api",
                  },
                  modules: [],
                  options: {},
                },
              ],
            });

            expect(blueprint.nodes.map((node) => node.id)).toEqual([
              "apps/client-api",
              "apps/server-api",
            ]);
          }),
      );
    });
  });
});
