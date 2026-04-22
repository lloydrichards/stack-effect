import { Blueprint } from "@repo/domain/Blueprint";
import { String } from "effect";
import { describe, expect, it } from "vitest";

const makeUnsortedBlueprint = () =>
  new Blueprint({
    nodes: [
      {
        id: "packages/domain",
        identity: {
          kind: "package",
          name: "domain",
        },
        status: "implied",
        causes: [
          {
            _tag: "selection",
            source: {
              _tag: "target",
              id: "packages/domain",
            },
          },
          {
            _tag: "dependency",
            edgeId: "a-dependency",
          },
        ],
        targetModules: [
          {
            moduleId: "domain-api",
            status: "implied",
            causes: [
              {
                _tag: "selection",
                source: {
                  _tag: "target-module",
                  targetId: "packages/domain",
                  moduleId: "domain-api",
                },
              },
              {
                _tag: "dependency",
                edgeId: "a-target-module-dependency",
              },
            ],
          },
        ],
        composition: {
          _tag: "package",
          publicEntrypoint: "./Api",
        },
      },
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
          {
            _tag: "dependency",
            edgeId: "z-dependency",
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
                  targetId: "apps/server-api",
                  moduleId: "http-api-server",
                },
              },
            ],
          },
        ],
        composition: undefined,
      },
    ],
    edges: [
      {
        _tag: "depends-on",
        id: "z-edge",
        from: {
          _tag: "target",
          id: "packages/domain",
        },
        to: {
          _tag: "repo-module",
          id: "root-bootstrap",
        },
        reason: "required-repo-module",
      },
      {
        _tag: "depends-on",
        id: "a-edge",
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
    ],
    modules: [
      {
        moduleId: "root-bootstrap",
        status: "implied",
        causes: [
          {
            _tag: "selection",
            source: {
              _tag: "repo-module",
              id: "root-bootstrap",
            },
          },
          {
            _tag: "dependency",
            edgeId: "a-edge",
          },
        ],
      },
    ],
    warnings: [
      {
        _tag: "RedundantSelectionNormalized",
        node: {
          _tag: "target",
          id: "apps/server-api",
        },
        edgeIds: ["z-warning-edge", "a-warning-edge"],
      },
    ],
  });

const makeBlueprint = () =>
  new Blueprint({
    nodes: [
      {
        id: "packages/domain",
        identity: {
          kind: "package",
          name: "domain",
        },
        status: "implied",
        causes: [
          {
            _tag: "dependency",
            edgeId:
              "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
          },
        ],
        targetModules: [
          {
            moduleId: "domain-api",
            status: "implied",
            causes: [
              {
                _tag: "dependency",
                edgeId:
                  "required-target-module=>target-module:apps/server-api:http-api-server=>target-module:packages/domain:domain-api",
              },
            ],
          },
        ],
        composition: {
          _tag: "package",
          publicEntrypoint: "./Api",
        },
      },
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
          {
            _tag: "dependency",
            edgeId:
              "required-owning-target=>target-module:apps/server-api:http-api-server=>target:apps/server-api",
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
                  targetId: "apps/server-api",
                  moduleId: "http-api-server",
                },
              },
            ],
          },
        ],
        composition: undefined,
      },
    ],
    edges: [
      {
        _tag: "depends-on",
        id: "required-repo-module=>target:packages/domain=>repo-module:root-bootstrap",
        from: {
          _tag: "target",
          id: "packages/domain",
        },
        to: {
          _tag: "repo-module",
          id: "root-bootstrap",
        },
        reason: "required-repo-module",
      },
      {
        _tag: "depends-on",
        id: "required-target-module=>target-module:apps/server-api:http-api-server=>target-module:packages/domain:domain-api",
        from: {
          _tag: "target-module",
          targetId: "apps/server-api",
          moduleId: "http-api-server",
        },
        to: {
          _tag: "target-module",
          targetId: "packages/domain",
          moduleId: "domain-api",
        },
        reason: "required-target-module",
      },
      {
        _tag: "depends-on",
        id: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
        from: {
          _tag: "target-module",
          targetId: "apps/server-api",
          moduleId: "http-api-server",
        },
        to: {
          _tag: "target",
          id: "packages/domain",
        },
        reason: "required-canonical-target",
      },
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
    ],
    modules: [
      {
        moduleId: "root-bootstrap",
        status: "implied",
        causes: [
          {
            _tag: "dependency",
            edgeId:
              "required-repo-module=>target:apps/server-api=>repo-module:root-bootstrap",
          },
          {
            _tag: "dependency",
            edgeId:
              "required-repo-module=>target:packages/domain=>repo-module:root-bootstrap",
          },
        ],
      },
    ],
    warnings: [
      {
        _tag: "RedundantSelectionNormalized",
        node: {
          _tag: "target",
          id: "apps/server-api",
        },
        edgeIds: [
          "required-owning-target=>target-module:apps/server-api:http-api-server=>target:apps/server-api",
        ],
      },
    ],
  }).toSorted();

describe("@repo/domain Blueprint", () => {
  it("should sort blueprint nodes, edges, warnings, and causes deterministically", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    expect(blueprint.nodes.map((node) => node.id)).toEqual([
      "apps/server-api",
      "packages/domain",
    ]);
    expect(blueprint.edges.map((edge) => edge.id)).toEqual([
      "a-edge",
      "z-edge",
    ]);
    expect(blueprint.modules[0]?.causes).toEqual([
      {
        _tag: "dependency",
        edgeId: "a-edge",
      },
      {
        _tag: "selection",
        source: {
          _tag: "repo-module",
          id: "root-bootstrap",
        },
      },
    ]);
    expect(blueprint.getTarget("packages/domain")?.causes).toEqual([
      {
        _tag: "dependency",
        edgeId: "a-dependency",
      },
      {
        _tag: "selection",
        source: {
          _tag: "target",
          id: "packages/domain",
        },
      },
    ]);
    expect(
      blueprint.getTarget("packages/domain")?.targetModules[0]?.causes,
    ).toEqual([
      {
        _tag: "dependency",
        edgeId: "a-target-module-dependency",
      },
      {
        _tag: "selection",
        source: {
          _tag: "target-module",
          targetId: "packages/domain",
          moduleId: "domain-api",
        },
      },
    ]);
    expect(blueprint.warnings[0]?.edgeIds).toEqual([
      "a-warning-edge",
      "z-warning-edge",
    ]);
  });

  it("should expose helper methods for querying normalized blueprints", () => {
    const blueprint = makeBlueprint();

    expect(blueprint.hasTarget("apps/server-api")).toBe(true);
    expect(blueprint.hasTarget("apps/cli-tooling")).toBe(false);
    expect(blueprint.getTarget("packages/domain")?.status).toBe("implied");
    expect(blueprint.getSelectedTargets().map((target) => target.id)).toEqual([
      "apps/server-api",
    ]);
    expect(blueprint.getImpliedTargets().map((target) => target.id)).toEqual([
      "packages/domain",
    ]);
    expect(blueprint.hasWarnings()).toBe(true);
  });

  it("should expose safe helper behavior for an empty blueprint", () => {
    const blueprint = new Blueprint({
      nodes: [],
      edges: [],
      modules: [],
      warnings: [],
    });

    expect(blueprint.hasTarget("apps/server-api")).toBe(false);
    expect(blueprint.getTarget("apps/server-api")).toBeUndefined();
    expect(blueprint.getSelectedTargets()).toEqual([]);
    expect(blueprint.getImpliedTargets()).toEqual([]);
    expect(blueprint.hasWarnings()).toBe(false);
    expect(blueprint.prettyPrint()).toBe(
      String.stripMargin(`|Blueprint
       |
       |Legend: [*] selected  [+] implied  ╌> owns  ─> depends on`),
    );
  });

  it("should pretty print a normalized dependency blueprint", () => {
    const blueprint = makeBlueprint();

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
  });
});
