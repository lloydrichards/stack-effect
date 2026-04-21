import { describe, expect, layer } from "@effect/vitest";
import type { Blueprint, BlueprintError } from "@repo/domain/Blueprint";
import type { Selection } from "@repo/domain/Selection";
import { Effect } from "effect";
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

          expect(blueprint).toEqual({
            targets: [
              {
                targetId: "package/domain",
                identity: {
                  kind: "package",
                  name: "domain",
                },
                status: "implied",
                causes: [
                  {
                    _tag: "dependency",
                    source: {
                      _tag: "target-module",
                      targetId: "package/domain",
                      moduleId: "domain-api",
                    },
                  },
                  {
                    _tag: "dependency",
                    source: {
                      _tag: "target-module",
                      targetId: "server/api",
                      moduleId: "http-api-server",
                    },
                  },
                ],
                targetModules: [
                  {
                    moduleId: "domain-api",
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
                ],
              },
              {
                targetId: "server/api",
                identity: {
                  kind: "server",
                  name: "api",
                },
                status: "selected",
                causes: [
                  {
                    _tag: "dependency",
                    source: {
                      _tag: "target-module",
                      targetId: "server/api",
                      moduleId: "http-api-server",
                    },
                  },
                  {
                    _tag: "selection",
                    source: {
                      _tag: "target",
                      targetId: "server/api",
                    },
                  },
                ],
                targetModules: [
                  {
                    moduleId: "http-api-server",
                    status: "selected",
                    causes: [
                      {
                        _tag: "selection",
                        source: {
                          _tag: "target-module",
                          targetId: "server/api",
                          moduleId: "http-api-server",
                        },
                      },
                    ],
                  },
                ],
              },
            ],
            repoModules: [
              {
                moduleId: "root-bootstrap",
                status: "implied",
                causes: [
                  {
                    _tag: "dependency",
                    source: {
                      _tag: "target",
                      targetId: "package/domain",
                    },
                  },
                  {
                    _tag: "dependency",
                    source: {
                      _tag: "target",
                      targetId: "server/api",
                    },
                  },
                ],
              },
            ],
            targetCompositions: {
              "package/domain": {
                _tag: "package",
                publicEntrypoint: "./Api",
              },
            },
            intents: [
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
            ],
            warnings: [
              {
                _tag: "ImpliedDependencyAdded",
                causes: [
                  {
                    _tag: "target",
                    targetId: "package/domain",
                  },
                  {
                    _tag: "target",
                    targetId: "server/api",
                  },
                ],
                node: {
                  _tag: "repo-module",
                  moduleId: "root-bootstrap",
                },
              },
              {
                _tag: "ImpliedDependencyAdded",
                causes: [
                  {
                    _tag: "target",
                    targetId: "server/api",
                  },
                ],
                node: {
                  _tag: "target-module",
                  targetId: "package/domain",
                  moduleId: "domain-api",
                },
              },
              {
                _tag: "ImpliedDependencyAdded",
                causes: [
                  {
                    _tag: "target-module",
                    targetId: "package/domain",
                    moduleId: "domain-api",
                  },
                  {
                    _tag: "target-module",
                    targetId: "server/api",
                    moduleId: "http-api-server",
                  },
                ],
                node: {
                  _tag: "target",
                  targetId: "package/domain",
                },
              },
              {
                _tag: "RedundantSelectionNormalized",
                causes: [
                  {
                    _tag: "target-module",
                    targetId: "server/api",
                    moduleId: "http-api-server",
                  },
                ],
                node: {
                  _tag: "target",
                  targetId: "server/api",
                },
              },
            ],
          } satisfies typeof Blueprint.Type);
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
          } satisfies typeof Selection.Type);

          expect(blueprint.targets[0]?.status).toBe("selected");
          expect(blueprint.targets[0]?.targetId).toBe("package/domain");
          expect(blueprint.targets[0]?.targetModules[0]?.status).toBe(
            "selected",
          );
          expect(blueprint.repoModules[0]?.status).toBe("selected");
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
            } satisfies typeof Selection.Type),
          );

          expect(error).toEqual({
            _tag: "UnsupportedTargetModule",
            targetModule: {
              targetId: "package/domain",
              moduleId: "http-api-server",
            },
          } satisfies typeof BlueprintError.Type);
        }),
    );
  });
});
