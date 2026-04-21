import { describe, expect, layer } from "@effect/vitest";
import {
  Blueprint,
  ConceptualTargetCollision,
  UnsupportedTargetModule,
} from "@repo/domain/Blueprint";
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
                id: "server/api",
                modules: [{ id: "http-api-server" }],
              },
            ],
            repoModules: [],
          } satisfies typeof Selection.Type);

          expect(blueprint).toBeInstanceOf(Blueprint);
          expect(blueprint.nodes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: "package/domain",
                identity: {
                  kind: "package",
                  name: "domain",
                },
                status: "implied",
                composition: {
                  _tag: "package",
                  publicEntrypoint: "./Api",
                },
                targetModules: expect.arrayContaining([
                  expect.objectContaining({
                    moduleId: "domain-api",
                    status: "implied",
                  }),
                ]),
              }),
              expect.objectContaining({
                id: "server/api",
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
                id:
                  "required-canonical-target=>target-module:server/api:http-api-server=>target:package/domain",
                reason: "required-canonical-target",
              }),
              expect.objectContaining({
                id:
                  "required-target-module=>target-module:server/api:http-api-server=>target-module:package/domain:domain-api",
                reason: "required-target-module",
              }),
              expect.objectContaining({
                id:
                  "required-repo-module=>target:server/api=>repo-module:root-bootstrap",
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
                  id: "server/api",
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
                id: "server/api",
                modules: [{ id: "http-api-server" }],
              },
            ],
            repoModules: [],
          });

          expect(blueprint.hasTarget("server/api")).toBe(true);
          expect(blueprint.hasTarget("cli/tooling")).toBe(false);
          expect(blueprint.getTarget("package/domain")?.status).toBe("implied");
          expect(
            blueprint.getSelectedTargets().map((target) => target.id),
          ).toEqual(["server/api"]);
          expect(
            blueprint.getImpliedTargets().map((target) => target.id),
          ).toEqual(["package/domain"]);
          expect(blueprint.hasWarnings()).toBe(true);
          expect(blueprint.prettyPrint()).toBe(
            String.stripMargin(`|Blueprint
             |
             |Targets
             |- package/domain [implied] (package)
             |  - module:domain-api [implied]
             |  - composition: publicEntrypoint=./Api
             |- server/api [selected] (server)
             |  - module:http-api-server [selected]
             |
             |Repo Modules
             |- root-bootstrap [implied]
             |
             |Dependencies
              |- target-module:server/api/http-api-server -> target:package/domain [required-canonical-target]
              |- target-module:package/domain/domain-api -> target:package/domain [required-owning-target]
              |- target-module:server/api/http-api-server -> target:server/api [required-owning-target]
              |- target:package/domain -> repo-module:root-bootstrap [required-repo-module]
              |- target:server/api -> repo-module:root-bootstrap [required-repo-module]
              |- target-module:server/api/http-api-server -> target-module:package/domain/domain-api [required-target-module]
             |
             |Warnings
             |- RedundantSelectionNormalized: target:server/api <= required-owning-target=>target-module:server/api:http-api-server=>target:server/api`),
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
                id: "server/api",
                modules: [],
              },
            ],
            repoModules: [],
          });

          expect(blueprint.nodes).toEqual([
              {
                id: "server/api",
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
                    id: "server/api",
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
                    "required-repo-module=>target:server/api=>repo-module:root-bootstrap",
                },
              ],
            },
          ]);
          expect(blueprint.edges).toEqual([
              {
                _tag: "depends-on",
                id:
                  "required-repo-module=>target:server/api=>repo-module:root-bootstrap",
                from: {
                  _tag: "target",
                id: "server/api",
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
          repoModules: ["root-bootstrap"],
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

    it.effect(
      "keeps explicit selection precedence when canonical target and repo module are also implied",
      () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const blueprint = yield* blueprintService.resolve({
            targets: [
              {
                id: "server/api",
                modules: [{ id: "http-api-server" }],
              },
              {
                id: "package/domain",
                modules: [{ id: "domain-api" }],
              },
            ],
            repoModules: ["root-bootstrap"],
          });

          expect(blueprint.nodes[0]?.status).toBe("selected");
          expect(blueprint.nodes[0]?.id).toBe("package/domain");
          expect(blueprint.nodes[0]?.targetModules[0]?.status).toBe("selected");
          expect(blueprint.modules[0]?.status).toBe("selected");
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
                id: "server/api",
                modules: [{ id: "http-api-server" }],
              },
              {
                id: "server/api",
                modules: [{ id: "http-api-server" }],
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
                id: "root-bootstrap",
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
                id: "server/api",
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
                id: "package/domain",
                modules: [{ id: "domain-api" }],
              },
              {
                id: "server/api",
                modules: [{ id: "http-api-server" }],
              },
            ],
            repoModules: ["root-bootstrap"],
          });

          const second = yield* blueprintService.resolve({
            targets: [
              {
                id: "server/api",
                modules: [{ id: "http-api-server" }],
              },
              {
                id: "package/domain",
                modules: [{ id: "domain-api" }],
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
                  id: "server/api",
                  modules: [],
                },
                {
                  id: "client/api",
                  modules: [],
                },
              ],
              repoModules: [],
            }),
          );

          expect(error).toBeInstanceOf(ConceptualTargetCollision);
          expect(error).toMatchObject({
            _tag: "ConceptualTargetCollision",
            path: "apps/api",
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
                  id: "package/domain",
                  modules: [{ id: "http-api-server" }],
                },
              ],
              repoModules: [],
            }),
          );

          expect(error).toBeInstanceOf(UnsupportedTargetModule);
          expect(error).toMatchObject({
            _tag: "UnsupportedTargetModule",
            module: {
              targetId: "package/domain",
              moduleId: "http-api-server",
            },
          });
        }),
    );
  });
});
