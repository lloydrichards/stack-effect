import { describe, expect, layer } from "@effect/vitest";
import { Blueprint, BlueprintFailure } from "@repo/domain/Blueprint";
import type { Selection } from "@repo/domain/Selection";
import { Effect, String } from "effect";
import { BlueprintService } from "./BlueprintService";

describe("BlueprintService", () => {
  layer(BlueprintService.layer)("resolve", (it) => {
    it.effect(
      "resolves the first-slice server blueprint with implied canonical domain package",
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
          } satisfies typeof Selection.Type);

          expect(blueprint).toBeInstanceOf(Blueprint);
          expect(blueprint.nodes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: "packages/domain",
                identity: {
                  kind: "package",
                  name: "domain",
                },
                status: "implied",
                targetModules: expect.arrayContaining([
                  expect.objectContaining({
                    moduleId: "domain-api",
                    status: "implied",
                  }),
                ]),
              }),
              expect.objectContaining({
                id: "apps/server-api",
                identity: {
                  kind: "server",
                  name: "api",
                },
                status: "selected",
                targetModules: [
                  expect.objectContaining({
                    moduleId: "http-api-server",
                    status: "selected",
                  }),
                ],
              }),
            ]),
          );
          expect(blueprint.modules).toEqual([
            expect.objectContaining({
              moduleId: "root-bootstrap",
              status: "implied",
            }),
          ]);
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
          expect(blueprint.warnings).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "RedundantSelectionNormalized",
                node: {
                  _tag: "target",
                  id: "apps/server-api",
                },
              }),
            ]),
          );

          expect(blueprint.nodes).toHaveLength(2);
          expect(blueprint.modules).toHaveLength(1);
          expect(blueprint.edges).toHaveLength(6);
          expect(blueprint.warnings).toHaveLength(1);
        }),
    );

    it.effect(
      "returns a Blueprint instance with helpful instance methods",
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

          expect(blueprint.hasTarget("apps/server-api")).toBe(true);
          expect(blueprint.hasTarget("apps/cli-tooling")).toBe(false);
          expect(blueprint.getTarget("packages/domain")?.status).toBe(
            "implied",
          );
          expect(
            blueprint.getSelectedTargets().map((target) => target.id),
          ).toEqual(["apps/server-api"]);
          expect(
            blueprint.getImpliedTargets().map((target) => target.id),
          ).toEqual(["packages/domain"]);
          expect(blueprint.hasWarnings()).toBe(true);
          expect(blueprint.prettyPrint()).toBe(
            String.stripMargin(`|Blueprint
             |
             |Legend: [*] selected  [+] implied  ╌> owns  ─> depends on
             |
             |Targets
             |[*] apps/server-api (server)
             | ├╌> [*] apps/server-api/http-api-server
             | │    ├─> [+] packages/domain [canonical-target]
             | │    └─> [+] packages/domain/domain-api [target-module]
             | └─> [+] root-bootstrap [repo-module]
             |
             |[+] packages/domain (package)
             | ├╌> [+] packages/domain/domain-api
             | ├╌> composition: ./Api
             | └─> [+] root-bootstrap [repo-module]
             |
             |Repo Modules
             |[+] root-bootstrap
             |
             |Warnings
             |! target:apps/server-api also implied by:
             |  required-owning-target=>target-module:apps/server-api:http-api-server=>target:apps/server-api`),
          );
        }),
    );

    it.effect(
      "resolves a base target without selected modules while still implying root bootstrap",
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

          expect(blueprint.nodes).toEqual([
            {
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
            },
          ]);
          expect(blueprint.modules).toEqual([
            {
              moduleId: "root-bootstrap",
              status: "implied",
              causes: [
                {
                  _tag: "dependency",
                  edgeId:
                    "required-repo-module=>target:apps/server-api=>repo-module:root-bootstrap",
                },
              ],
            },
          ]);
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

    it.effect("supports explicit repo-only bootstrap initialization", () =>
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
        expect(blueprint.prettyPrint()).toContain("Repo Modules");
      }),
    );

    it.effect("accepts valid first-slice repo and target options", () =>
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
          options: {
            runtime: "bun",
            linter: "biome",
          },
        });

        expect(blueprint.nodes).toHaveLength(2);
        expect(blueprint.modules[0]?.moduleId).toBe("root-bootstrap");
      }),
    );

    it.effect(
      "accepts repo options when bootstrap is implied by selected targets",
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
            },
          });

          expect(blueprint.modules).toEqual([
            expect.objectContaining({
              moduleId: "root-bootstrap",
              status: "implied",
            }),
          ]);
        }),
    );

    it.effect(
      "keeps explicit selection precedence when canonical target and repo module are also implied",
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

          expect(blueprint.nodes[0]?.status).toBe("selected");
          expect(blueprint.nodes[0]?.id).toBe("apps/server-api");
          expect(blueprint.nodes[1]?.status).toBe("selected");
          expect(blueprint.nodes[1]?.id).toBe("packages/domain");
          expect(blueprint.nodes[1]?.targetModules[0]?.status).toBe("selected");
          expect(blueprint.modules[0]?.status).toBe("selected");
        }),
    );

    it.effect(
      "produces deterministic output regardless of selection ordering",
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
          expect(first.prettyPrint()).toBe(second.prettyPrint());
        }),
    );

    it.effect(
      "fails when a repo option is selected without a supporting repo module",
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
      "fails when repo runtime is selected without a supporting repo module",
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

    it.effect("fails when a target option requires an unselected module", () =>
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
      "allows different app kinds with the same name because their IDs no longer collide",
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

    it.effect(
      "fails through the Effect error channel for an unsupported target-module combination",
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
  });
});
