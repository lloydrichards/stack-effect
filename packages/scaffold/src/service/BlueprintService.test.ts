import { describe, expect, layer } from "@effect/vitest";
import { Blueprint, type BlueprintError } from "@repo/domain/Blueprint";
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
                targetId: "server/api",
                targetModules: [{ moduleId: "http-api-server" }],
              },
            ],
            repoModules: [],
          } satisfies typeof Selection.Type);

          expect(blueprint).toBeInstanceOf(Blueprint);
          expect(blueprint).toEqual(
            expect.objectContaining({
              targets: expect.arrayContaining([
                expect.objectContaining({
                  targetId: "package/domain",
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
                  targetId: "server/api",
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
              repoModules: [
                expect.objectContaining({
                  moduleId: "root-bootstrap",
                  status: "implied",
                }),
              ],
              targetCompositions: expect.objectContaining({
                "package/domain": {
                  _tag: "package",
                  publicEntrypoint: "./Api",
                },
              }),
              intents: expect.arrayContaining([
                {
                  _tag: "PackageEntrypoint",
                  targetId: "package/domain",
                  publicEntrypoint: "./Api",
                },
                {
                  _tag: "RepoModule",
                  moduleId: "root-bootstrap",
                },
                {
                  _tag: "Target",
                  targetId: "package/domain",
                },
                {
                  _tag: "Target",
                  targetId: "server/api",
                },
                {
                  _tag: "TargetModule",
                  targetId: "package/domain",
                  moduleId: "domain-api",
                },
                {
                  _tag: "TargetModule",
                  targetId: "server/api",
                  moduleId: "http-api-server",
                },
              ]),
              warnings: expect.arrayContaining([
                expect.objectContaining({
                  _tag: "ImpliedDependencyAdded",
                  node: {
                    _tag: "repo-module",
                    moduleId: "root-bootstrap",
                  },
                }),
                expect.objectContaining({
                  _tag: "ImpliedDependencyAdded",
                  node: {
                    _tag: "target-module",
                    targetId: "package/domain",
                    moduleId: "domain-api",
                  },
                }),
                expect.objectContaining({
                  _tag: "ImpliedDependencyAdded",
                  node: {
                    _tag: "target",
                    targetId: "package/domain",
                  },
                }),
                expect.objectContaining({
                  _tag: "RedundantSelectionNormalized",
                  node: {
                    _tag: "target",
                    targetId: "server/api",
                  },
                }),
              ]),
            }),
          );

          expect(blueprint.targets).toHaveLength(2);
          expect(blueprint.repoModules).toHaveLength(1);
          expect(blueprint.intents).toHaveLength(6);
          expect(blueprint.warnings).toHaveLength(4);
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
                targetId: "server/api",
                targetModules: [{ moduleId: "http-api-server" }],
              },
            ],
            repoModules: [],
          });

          expect(blueprint.hasTarget("server/api")).toBe(true);
          expect(blueprint.hasTarget("cli/tooling")).toBe(false);
          expect(blueprint.getTarget("package/domain")?.status).toBe("implied");
          expect(
            blueprint.getSelectedTargets().map((target) => target.targetId),
          ).toEqual(["server/api"]);
          expect(
            blueprint.getImpliedTargets().map((target) => target.targetId),
          ).toEqual(["package/domain"]);
          expect(blueprint.hasWarnings()).toBe(true);
          expect(blueprint.prettyPrint()).toBe(
            String.stripMargin(`|Blueprint
            |
            |Targets
            |- package/domain [implied] (package)
            |  - module:domain-api [implied]
            |- server/api [selected] (server)
            |  - module:http-api-server [selected]
            |
            |Repo Modules
            |- root-bootstrap [implied]
            |
            |Warnings
            |- ImpliedDependencyAdded: repo-module:root-bootstrap <= target:package/domain, target:server/api
            |- ImpliedDependencyAdded: target-module:package/domain:domain-api <= target:server/api
            |- ImpliedDependencyAdded: target:package/domain <= target-module:package/domain:domain-api, target-module:server/api:http-api-server
            |- RedundantSelectionNormalized: target:server/api <= target-module:server/api:http-api-server`),
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
                targetId: "server/api",
                targetModules: [],
              },
            ],
            repoModules: [],
          });

          expect(blueprint.targets).toEqual([
            {
              targetId: "server/api",
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
                    targetId: "server/api",
                  },
                },
              ],
              targetModules: [],
            },
          ]);
          expect(blueprint.repoModules).toEqual([
            {
              moduleId: "root-bootstrap",
              status: "implied",
              causes: [
                {
                  _tag: "dependency",
                  source: {
                    _tag: "target",
                    targetId: "server/api",
                  },
                },
              ],
            },
          ]);
          expect(blueprint.targetCompositions).toEqual({});
          expect(blueprint.intents).toEqual([
            {
              _tag: "RepoModule",
              moduleId: "root-bootstrap",
            },
            {
              _tag: "Target",
              targetId: "server/api",
            },
          ]);
        }),
    );

    it.effect("supports explicit repo-only bootstrap initialization", () =>
      Effect.gen(function* () {
        const blueprintService = yield* BlueprintService;
        const blueprint = yield* blueprintService.resolve({
          targets: [],
          repoModules: ["root-bootstrap"],
        });

        expect(blueprint.targets).toEqual([]);
        expect(blueprint.repoModules).toEqual([
          {
            moduleId: "root-bootstrap",
            status: "selected",
            causes: [
              {
                _tag: "selection",
                source: {
                  _tag: "repo-module",
                  moduleId: "root-bootstrap",
                },
              },
            ],
          },
        ]);
        expect(blueprint.warnings).toEqual([]);
        expect(blueprint.prettyPrint()).toContain("Repo Modules");
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
                targetId: "server/api",
                targetModules: [{ moduleId: "http-api-server" }],
              },
              {
                targetId: "package/domain",
                targetModules: [{ moduleId: "domain-api" }],
              },
            ],
            repoModules: ["root-bootstrap"],
          });

          expect(blueprint.targets[0]?.status).toBe("selected");
          expect(blueprint.targets[0]?.targetId).toBe("package/domain");
          expect(blueprint.targets[0]?.targetModules[0]?.status).toBe(
            "selected",
          );
          expect(blueprint.repoModules[0]?.status).toBe("selected");
        }),
    );

    it.effect(
      "normalizes duplicate selections into warnings instead of failures",
      () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const blueprint = yield* blueprintService.resolve({
            targets: [
              {
                targetId: "server/api",
                targetModules: [{ moduleId: "http-api-server" }],
              },
              {
                targetId: "server/api",
                targetModules: [{ moduleId: "http-api-server" }],
              },
            ],
            repoModules: ["root-bootstrap", "root-bootstrap"],
          });

          expect(
            blueprint.warnings.filter(
              (warning) => warning._tag === "DuplicateSelectionNormalized",
            ),
          ).toEqual([
            {
              _tag: "DuplicateSelectionNormalized",
              node: {
                _tag: "repo-module",
                moduleId: "root-bootstrap",
              },
            },
            {
              _tag: "DuplicateSelectionNormalized",
              node: {
                _tag: "target-module",
                targetId: "server/api",
                moduleId: "http-api-server",
              },
            },
            {
              _tag: "DuplicateSelectionNormalized",
              node: {
                _tag: "target",
                targetId: "server/api",
              },
            },
          ]);
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
                targetId: "package/domain",
                targetModules: [{ moduleId: "domain-api" }],
              },
              {
                targetId: "server/api",
                targetModules: [{ moduleId: "http-api-server" }],
              },
            ],
            repoModules: ["root-bootstrap"],
          });

          const second = yield* blueprintService.resolve({
            targets: [
              {
                targetId: "server/api",
                targetModules: [{ moduleId: "http-api-server" }],
              },
              {
                targetId: "package/domain",
                targetModules: [{ moduleId: "domain-api" }],
              },
            ],
            repoModules: ["root-bootstrap"],
          });

          expect(first).toEqual(second);
          expect(first.prettyPrint()).toBe(second.prettyPrint());
        }),
    );

    it.effect(
      "fails when two selected targets collide on the same conceptual path",
      () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const error = yield* Effect.flip(
            blueprintService.resolve({
              targets: [
                {
                  targetId: "server/api",
                  targetModules: [],
                },
                {
                  targetId: "client/api",
                  targetModules: [],
                },
              ],
              repoModules: [],
            }),
          );

          expect(error).toEqual({
            _tag: "ConceptualTargetCollision",
            conceptualPath: "apps/api",
            targetIds: ["server/api", "client/api"],
          });
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
                  targetId: "package/domain",
                  targetModules: [{ moduleId: "http-api-server" }],
                },
              ],
              repoModules: [],
            }),
          );

          expect(error).toEqual({
            _tag: "UnsupportedTargetModule",
            targetModule: {
              targetId: "package/domain",
              moduleId: "http-api-server",
            },
          });
        }),
    );
  });
});
