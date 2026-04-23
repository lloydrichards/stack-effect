import { Blueprint, toModuleNodeId } from "@repo/domain/Blueprint";
import { String } from "effect";
import { describe, expect, it } from "vitest";

const makeUnsortedBlueprint = () =>
  new Blueprint({
    nodes: [
      {
        _tag: "target",
        id: "packages/domain",
        identity: {
          kind: "package",
          name: "domain",
        },
        modules: [{ moduleId: "domain-api" }],
      },
      {
        _tag: "target",
        id: "apps/server-api",
        identity: {
          kind: "server",
          name: "api",
        },
        modules: [{ moduleId: "http-api-server" }],
      },
    ],
    edges: [
      {
        id: "z-edge",
        from: toModuleNodeId("apps/server-api", "http-api-server"),
        to: toModuleNodeId("packages/domain", "domain-api"),
        reason: "required-module",
      },
      {
        id: "a-edge",
        from: toModuleNodeId("apps/server-api", "http-api-server"),
        to: "packages/domain",
        reason: "required-target",
      },
    ],
    roots: [
      toModuleNodeId("apps/server-api", "http-api-server"),
      "apps/server-api",
    ],
  });

describe("@repo/domain Blueprint", () => {
  it("should sort blueprint nodes, edges, and roots deterministically", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    expect(blueprint.nodes.map((node) => node.id)).toEqual([
      "apps/server-api",
      "packages/domain",
    ]);
    expect(blueprint.edges.map((edge) => edge.id)).toEqual([
      "a-edge",
      "z-edge",
    ]);
    expect(blueprint.roots).toEqual([
      "apps/server-api",
      toModuleNodeId("apps/server-api", "http-api-server"),
    ]);
  });

  it("should expose helper methods for querying blueprints", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    expect(blueprint.hasTarget("apps/server-api")).toBe(true);
    expect(blueprint.hasTarget("apps/cli-tooling")).toBe(false);
    expect(blueprint.getTarget("packages/domain")?.modules).toEqual([
      { moduleId: "domain-api" },
    ]);
    expect(blueprint.getRootTargets().map((target) => target.id)).toEqual([
      "apps/server-api",
    ]);
  });

  it("should expose safe helper behavior for an empty blueprint", () => {
    const blueprint = new Blueprint({
      nodes: [],
      edges: [],
      roots: [],
    });

    expect(blueprint.hasTarget("apps/server-api")).toBe(false);
    expect(blueprint.getTarget("apps/server-api")).toBeUndefined();
    expect(blueprint.getRootTargets()).toEqual([]);
    expect(blueprint.prettyPrint()).toBe(
      String.stripMargin(`|Blueprint
       |
       |Legend: [*] root  [+] implied`),
    );
  });

  it("should pretty print a normalized dependency blueprint", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    expect(blueprint.prettyPrint()).toBe(
      String.stripMargin(`|Blueprint
       |
       |Legend: [*] root  [+] implied
       |
       |Targets
       |[*] apps/server-api (server)
       | └╌> [*] apps/server-api#http-api-server
       |      ├─> [+] packages/domain [required-target]
       |      └─> [+] packages/domain#domain-api [required-module]
       |[+] packages/domain (package)
       | └╌> [+] packages/domain#domain-api`),
    );
  });
});
