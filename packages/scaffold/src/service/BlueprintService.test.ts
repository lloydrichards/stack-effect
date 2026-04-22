import assert from "node:assert/strict";
import { describe, expect, layer } from "@effect/vitest";
import {
  type Blueprint,
  BlueprintFailure,
  type BlueprintNodeReference,
  CatalogNotFound,
  type ResolvedTarget,
} from "@repo/domain/Blueprint";
import { Effect } from "effect";
import { BlueprintService } from "./BlueprintService";

const getNode = (blueprint: Blueprint, id: string): ResolvedTarget => {
  const node = blueprint.nodes.find((candidate) => candidate.id === id);
  assert(node !== undefined, `Expected blueprint node ${id} to exist`);
  return node;
};

const getTargetModule = (target: ResolvedTarget, moduleId: string) => {
  const targetModule = target.targetModules.find(
    (candidate) => candidate.moduleId === moduleId,
  );
  assert(
    targetModule !== undefined,
    `Expected target module ${moduleId} to exist`,
  );
  return targetModule;
};

const getRepoModule = (blueprint: Blueprint, moduleId: string) => {
  const repoModule = blueprint.modules.find(
    (candidate) => candidate.moduleId === moduleId,
  );
  assert(repoModule !== undefined, `Expected repo module ${moduleId} to exist`);
  return repoModule;
};

const expectRedundantSelectionWarning = (
  blueprint: Blueprint,
  node: BlueprintNodeReference,
) => {
  expect(blueprint.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        _tag: "RedundantSelectionNormalized",
        node,
      }),
    ]),
  );
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
              modules: [],
              options: {},
            }),
          );

          expect(error).toBeInstanceOf(BlueprintFailure);
          expect(error).toMatchObject({
            message: "Duplicate target selection: apps/server-api",
          });
        }),
      );

      it.effect(
        "should fail when the same target module is selected twice",
        () =>
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
                modules: [],
                options: {},
              }),
            );

            expect(error).toBeInstanceOf(BlueprintFailure);
            expect(error).toMatchObject({
              message:
                "Duplicate target module selection: apps/server-api requires module http-api-server",
            });
          }),
      );

      it.effect(
        "should fail when httpApiStyle is provided without http-api-server",
        () =>
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
                    options: {
                      httpApiStyle: "rest",
                    },
                  },
                ],
                modules: [],
                options: {},
              }),
            );

            expect(error).toBeInstanceOf(BlueprintFailure);
            expect(error).toMatchObject({
              message:
                "Module gated target option: httpApiStyle requires module http-api-server",
            });
          }),
      );

      it.effect(
        "should fail when domainApiSurface is provided without domain-api",
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
                    modules: [],
                    options: {
                      domainApiSurface: "api",
                    },
                  },
                ],
                modules: [],
                options: {},
              }),
            );

            expect(error).toBeInstanceOf(BlueprintFailure);
            expect(error).toMatchObject({
              message:
                "Module gated target option: domainApiSurface requires module domain-api",
            });
          }),
      );

      it.effect(
        "should fail when linter is provided without root-bootstrap support",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const error = yield* Effect.flip(
              blueprintService.resolve({
                targets: [],
                modules: [],
                options: {
                  linter: "biome",
                },
              }),
            );

            expect(error).toBeInstanceOf(BlueprintFailure);
            expect(error).toMatchObject({
              message: "Invalid repo option: linter",
            });
          }),
      );

      it.effect(
        "should fail when runtime is provided without root-bootstrap support",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;
            const error = yield* Effect.flip(
              blueprintService.resolve({
                targets: [],
                modules: [],
                options: {
                  runtime: "bun",
                },
              }),
            );

            expect(error).toBeInstanceOf(BlueprintFailure);
            expect(error).toMatchObject({
              message: "Invalid repo option: runtime",
            });
          }),
      );

      it.effect(
        "should fail when a target module is not supported by the selected target",
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
                modules: [],
                options: {},
              }),
            );

            expect(error).toBeInstanceOf(BlueprintFailure);
            expect(error).toMatchObject({
              message:
                "Unsupported target-module combination: packages/domain requires module http-api-server",
            });
          }),
      );

      it.effect("should propagate a missing repo module catalog lookup", () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const error = yield* Effect.flip(
            blueprintService.resolve({
              targets: [],
              modules: ["missing-repo-module" as never],
              options: {},
            }),
          );

          expect(error).toBeInstanceOf(CatalogNotFound);
          expect(error).toMatchObject({
            catalog: "module",
            entity: "repo-module",
            id: "missing-repo-module",
          });
        }),
      );

      it.effect("should propagate a missing target module catalog lookup", () =>
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
              modules: [],
              options: {},
            }),
          );

          expect(error).toBeInstanceOf(CatalogNotFound);
          expect(error).toMatchObject({
            catalog: "module",
            entity: "target-module",
            id: "missing-target-module",
          });
        }),
      );

      it.effect("should propagate a missing target kind catalog lookup", () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const error = yield* Effect.flip(
            blueprintService.resolve({
              targets: [
                {
                  identity: {
                    kind: "worker" as never,
                    name: "api",
                  },
                  modules: [],
                  options: {},
                },
              ],
              modules: [],
              options: {},
            }),
          );

          expect(error).toBeInstanceOf(CatalogNotFound);
          expect(error).toMatchObject({
            catalog: "target",
            entity: "target-kind",
            id: "worker",
          });
        }),
      );
    });

    describe("when resolving dependencies", () => {
      it.effect(
        "should imply root-bootstrap when a base target is selected",
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
              ],
              modules: [],
              options: {},
            });

            const server = getNode(blueprint, "apps/server-api");
            const rootBootstrap = getRepoModule(blueprint, "root-bootstrap");

            expect(server).toEqual({
              id: "apps/server-api",
              identity: {
                kind: "server",
                name: "api",
              },
              status: "selected",
              causes: [
                {
                  _tag: "selection",
                  source: {
                    _tag: "target",
                    id: "apps/server-api",
                  },
                },
              ],
              targetModules: [],
              composition: undefined,
            });
            expect(rootBootstrap).toEqual({
              moduleId: "root-bootstrap",
              status: "implied",
              causes: [
                {
                  _tag: "dependency",
                  edgeId:
                    "required-repo-module=>target:apps/server-api=>repo-module:root-bootstrap",
                },
              ],
            });
            expect(blueprint.edges).toEqual([
              {
                _tag: "depends-on",
                id: "required-repo-module=>target:apps/server-api=>repo-module:root-bootstrap",
                from: {
                  _tag: "target",
                  id: "apps/server-api",
                },
                to: {
                  _tag: "repo-module",
                  id: "root-bootstrap",
                },
                reason: "required-repo-module",
              },
            ]);
          }),
      );

      it.effect(
        "should imply canonical targets and dependent target modules when http-api-server is selected",
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
              modules: [],
              options: {},
            });

            const server = getNode(blueprint, "apps/server-api");
            const domain = getNode(blueprint, "packages/domain");
            const httpApiServer = getTargetModule(server, "http-api-server");
            const domainApi = getTargetModule(domain, "domain-api");
            const rootBootstrap = getRepoModule(blueprint, "root-bootstrap");

            expect(server.status).toBe("selected");
            expect(httpApiServer.status).toBe("selected");
            expect(domain.status).toBe("implied");
            expect(domainApi.status).toBe("implied");
            expect(rootBootstrap.status).toBe("implied");
            expect(domain.composition).toEqual({
              _tag: "package",
              publicEntrypoint: "./Api",
            });
            expect(blueprint.edges).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
                  reason: "required-canonical-target",
                }),
                expect.objectContaining({
                  id: "required-target-module=>target-module:apps/server-api:http-api-server=>target-module:packages/domain:domain-api",
                  reason: "required-target-module",
                }),
                expect.objectContaining({
                  id: "required-repo-module=>target:apps/server-api=>repo-module:root-bootstrap",
                  reason: "required-repo-module",
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
              modules: [],
              options: {},
            });

            expect(blueprint.nodes.map((node) => node.id)).toEqual([
              "apps/client-api",
              "apps/server-api",
            ]);
          }),
      );
    });

    describe("when accepting valid option combinations", () => {
      it.effect(
        "should accept target options when their supporting modules are selected",
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
                  options: {
                    httpApiStyle: "rest",
                  },
                },
                {
                  identity: {
                    kind: "package",
                    name: "domain",
                  },
                  modules: [{ id: "domain-api" }],
                  options: {
                    domainApiSurface: "api",
                  },
                },
              ],
              modules: ["root-bootstrap"],
              options: {},
            });

            expect(
              getTargetModule(
                getNode(blueprint, "apps/server-api"),
                "http-api-server",
              ).status,
            ).toBe("selected");
            expect(
              getTargetModule(
                getNode(blueprint, "packages/domain"),
                "domain-api",
              ).status,
            ).toBe("selected");
            expect(getRepoModule(blueprint, "root-bootstrap").status).toBe(
              "selected",
            );
          }),
      );

      it.effect(
        "should accept repo options when root-bootstrap is implied by selected targets",
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
              ],
              modules: [],
              options: {
                linter: "biome",
                runtime: "bun",
              },
            });

            expect(getRepoModule(blueprint, "root-bootstrap").status).toBe(
              "implied",
            );
          }),
      );

      it.effect("should support explicit repo-only bootstrap selection", () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const blueprint = yield* blueprintService.resolve({
            targets: [],
            modules: ["root-bootstrap"],
            options: {},
          });

          expect(blueprint.nodes).toEqual([]);
          expect(blueprint.modules).toEqual([
            {
              moduleId: "root-bootstrap",
              status: "selected",
              causes: [
                {
                  _tag: "selection",
                  source: {
                    _tag: "repo-module",
                    id: "root-bootstrap",
                  },
                },
              ],
            },
          ]);
          expect(blueprint.warnings).toEqual([]);
        }),
      );
    });

    describe("when normalizing output", () => {
      it.effect(
        "should keep explicit selections selected when they are also implied",
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
                {
                  identity: {
                    kind: "package",
                    name: "domain",
                  },
                  modules: [{ id: "domain-api" }],
                  options: {},
                },
              ],
              modules: ["root-bootstrap"],
              options: {},
            });

            expect(getNode(blueprint, "apps/server-api").status).toBe(
              "selected",
            );
            expect(getNode(blueprint, "packages/domain").status).toBe(
              "selected",
            );
            expect(
              getTargetModule(
                getNode(blueprint, "packages/domain"),
                "domain-api",
              ).status,
            ).toBe("selected");
            expect(getRepoModule(blueprint, "root-bootstrap").status).toBe(
              "selected",
            );
          }),
      );

      it.effect(
        "should produce deterministic output regardless of selection ordering",
        () =>
          Effect.gen(function* () {
            const blueprintService = yield* BlueprintService;

            const first = yield* blueprintService.resolve({
              targets: [
                {
                  identity: {
                    kind: "package",
                    name: "domain",
                  },
                  modules: [{ id: "domain-api" }],
                  options: {},
                },
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
            });

            const second = yield* blueprintService.resolve({
              targets: [
                {
                  identity: {
                    kind: "server",
                    name: "api",
                  },
                  modules: [{ id: "http-api-server" }],
                  options: {},
                },
                {
                  identity: {
                    kind: "package",
                    name: "domain",
                  },
                  modules: [{ id: "domain-api" }],
                  options: {},
                },
              ],
              modules: ["root-bootstrap"],
              options: {},
            });

            expect(first).toEqual(second);
          }),
      );
    });

    describe("when selected nodes are also implied", () => {
      it.effect(
        "should emit a redundant selection warning for a selected target",
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
                {
                  identity: {
                    kind: "package",
                    name: "domain",
                  },
                  modules: [],
                  options: {},
                },
              ],
              modules: [],
              options: {},
            });

            expectRedundantSelectionWarning(blueprint, {
              _tag: "target",
              id: "packages/domain",
            });
          }),
      );

      it.effect(
        "should emit a redundant selection warning for a selected target module",
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
                {
                  identity: {
                    kind: "package",
                    name: "domain",
                  },
                  modules: [{ id: "domain-api" }],
                  options: {},
                },
              ],
              modules: [],
              options: {},
            });

            expectRedundantSelectionWarning(blueprint, {
              _tag: "target-module",
              targetId: "packages/domain",
              moduleId: "domain-api",
            });
          }),
      );

      it.effect(
        "should emit a redundant selection warning for a selected repo module",
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
              ],
              modules: ["root-bootstrap"],
              options: {},
            });

            expectRedundantSelectionWarning(blueprint, {
              _tag: "repo-module",
              id: "root-bootstrap",
            });
          }),
      );
    });
  });
});
