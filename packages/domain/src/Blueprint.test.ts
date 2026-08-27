import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ClassicArchitecture,
  DddArchitecture,
  ModuleId,
  TargetIdentity,
  TargetKey,
  TargetKind,
  TargetPath,
} from "./Catalog";

const domainIdentity = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "domain",
});
const serverApiIdentity = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "api",
});

const makeUnsortedBlueprint = () =>
  new Blueprint({
    nodes: [
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        targetId: domainIdentity.toKey(),
        moduleId: ModuleId.make("domain-api-contracts"),
      },
      {
        _tag: "target",
        id: domainIdentity.toKey(),
        identity: domainIdentity,
        architecture: ClassicArchitecture,
        layout: {
          path: domainIdentity.toPath(),
          packageName: domainIdentity.toPackageName(),
        },
      },
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        targetId: serverApiIdentity.toKey(),
        moduleId: ModuleId.make("server-http-api"),
      },
      {
        _tag: "target",
        id: serverApiIdentity.toKey(),
        identity: serverApiIdentity,
        architecture: ClassicArchitecture,
        layout: {
          path: serverApiIdentity.toPath(),
          packageName: serverApiIdentity.toPackageName(),
        },
      },
    ],
    edges: [
      {
        id: "z-edge",
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        reason: "required-module",
      },
      {
        id: "m-edge",
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        reason: "owns-module",
      },
      {
        id: "n-edge",
        from: serverApiIdentity.toKey(),
        to: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        reason: "owns-module",
      },
      {
        id: "a-edge",
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        to: domainIdentity.toKey(),
        reason: "required-target",
      },
    ],
  });

describe("@repo/domain Blueprint", () => {
  it("should derive canonical paths and match identity rules when names need normalization", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "My Api",
    });

    expect(identity.toKey()).toBe("apps/server-my-api");
    expect(identity.toPath()).toBe("apps/server-my-api");
    expect(
      identity.matches({ _tag: "kind", kind: TargetKind.make("server") }),
    ).toBe(true);
    expect(
      identity.matches({
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "my-api",
        }),
      }),
    ).toBe(true);
    expect(
      identity.matches({
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("client-react"),
          name: "my-api",
        }),
      }),
    ).toBe(false);
  });

  it("should preserve target identity behavior when decoding", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "package",
      name: "domain",
    });

    expect(identity).toBeInstanceOf(TargetIdentity);
    expect(identity.toKey()).toBe("packages/domain");
    expect(identity.toPath()).toBe("packages/domain");
  });

  it("should sort nodes and edges deterministically when normalizing a Blueprint", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    expect(blueprint.nodes.map((node) => node.id)).toEqual([
      toAttachedModuleNodeId(
        serverApiIdentity.toKey(),
        ModuleId.make("server-http-api"),
      ),
      toAttachedModuleNodeId(
        domainIdentity.toKey(),
        ModuleId.make("domain-api-contracts"),
      ),
      "apps/server-api",
      "packages/domain",
    ]);
    expect(blueprint.edges.map((edge) => edge.id)).toEqual([
      "a-edge",
      "m-edge",
      "n-edge",
      "z-edge",
    ]);
  });

  it("should return present and absent targets when querying a Blueprint", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();
    const emptyBlueprint = new Blueprint({ nodes: [], edges: [] });

    expect(blueprint.hasTarget("apps/server-api")).toBe(true);
    expect(blueprint.hasTarget("apps/cli-tooling")).toBe(false);
    expect(blueprint.getTarget("packages/domain")).toEqual({
      _tag: "target",
      id: "packages/domain",
      identity: {
        kind: "package",
        name: "domain",
      },
      architecture: "classic",
      layout: {
        path: "packages/domain",
        packageName: "@repo/domain",
      },
    });
    expect(emptyBlueprint.hasTarget("apps/server-api")).toBe(false);
    expect(emptyBlueprint.getTarget("apps/server-api")).toBeUndefined();
  });

  it("resolves legacy target nodes to Classic identity layout", () => {
    const blueprint = Schema.decodeUnknownSync(Blueprint)({
      nodes: [
        {
          _tag: "target",
          id: "apps/server-todo",
          identity: { kind: "server", name: "todo" },
        },
      ],
      edges: [],
    });
    const target = blueprint.getTarget("apps/server-todo");
    expect(target?.architecture).toBe(ClassicArchitecture);
    expect(target?.layout).toEqual({
      path: "apps/server-todo",
      packageName: "server-todo",
    });
  });

  it("retains a resolved DDD architecture and physical layout", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "todo",
    });
    const blueprint = new Blueprint({
      nodes: [
        {
          _tag: "target",
          id: identity.toKey(),
          identity,
          architecture: DddArchitecture,
          layout: {
            path: TargetPath.make("apps/todo"),
            packageName: "@repo/todo-app",
          },
        },
      ],
      edges: [],
    });
    expect(blueprint.getTarget(identity.toKey())?.layout.path).toBe(
      "apps/todo",
    );
  });

  it("rejects duplicate resolved physical layouts", () => {
    expect(
      () =>
        new Blueprint({
          nodes: [domainIdentity, serverApiIdentity].map((identity) => ({
            _tag: "target" as const,
            id: identity.toKey(),
            identity,
            architecture: ClassicArchitecture,
            layout: {
              path: TargetPath.make("same/path"),
              packageName: identity.toPackageName(),
            },
          })),
          edges: [],
        }),
    ).toThrow();
  });

  const invalidBlueprints = [
    {
      name: "duplicate node IDs",
      mutate: (blueprint: Blueprint) => ({
        nodes: [...blueprint.nodes, ...blueprint.nodes.slice(0, 1)],
        edges: blueprint.edges,
      }),
      message: "Blueprint node id must be unique",
    },
    {
      name: "duplicate edge IDs",
      mutate: (blueprint: Blueprint) => ({
        nodes: blueprint.nodes,
        edges: [
          ...blueprint.edges,
          {
            id: "z-edge",
            from: domainIdentity.toKey(),
            to: serverApiIdentity.toKey(),
            reason: "required-target" as const,
          },
        ],
      }),
      message: "Blueprint edge id must be unique",
    },
    {
      name: "a non-canonical target ID",
      mutate: (blueprint: Blueprint) => ({
        nodes: blueprint.nodes.map((node) =>
          node._tag === "target" && node.id === domainIdentity.toKey()
            ? { ...node, id: TargetKey.make("packages/not-domain") }
            : node,
        ),
        edges: blueprint.edges,
      }),
      message: "Blueprint target id must match its canonical identity",
    },
    {
      name: "a non-canonical attached-module ID",
      mutate: (blueprint: Blueprint) => ({
        nodes: blueprint.nodes.map((node) =>
          node._tag === "attached-module" &&
          node.targetId === domainIdentity.toKey()
            ? {
                ...node,
                id: toAttachedModuleNodeId(
                  domainIdentity.toKey(),
                  ModuleId.make("wrong-module"),
                ),
              }
            : node,
        ),
        edges: blueprint.edges,
      }),
      message: "Blueprint attached-module id must match",
    },
    {
      name: "a missing target",
      mutate: (blueprint: Blueprint) => ({
        nodes: blueprint.nodes.filter(
          (node) =>
            !(node._tag === "target" && node.id === domainIdentity.toKey()),
        ),
        edges: blueprint.edges,
      }),
      message: "must resolve to exactly one target",
    },
    {
      name: "a missing ownership edge",
      mutate: (blueprint: Blueprint) => ({
        nodes: blueprint.nodes,
        edges: blueprint.edges.filter((edge) => edge.id !== "m-edge"),
      }),
      message: "must have exactly one owns-module edge",
    },
    {
      name: "multiple ownership edges for one attached module",
      mutate: (blueprint: Blueprint) => ({
        nodes: blueprint.nodes,
        edges: [
          ...blueprint.edges,
          {
            id: "x-edge",
            from: domainIdentity.toKey(),
            to: toAttachedModuleNodeId(
              domainIdentity.toKey(),
              ModuleId.make("domain-api-contracts"),
            ),
            reason: "owns-module" as const,
          },
        ],
      }),
      message: "must have exactly one owns-module edge",
    },
    {
      name: "a contradictory ownership edge",
      mutate: (blueprint: Blueprint) => ({
        nodes: blueprint.nodes,
        edges: [
          ...blueprint.edges,
          {
            id: "contradictory-edge",
            from: serverApiIdentity.toKey(),
            to: toAttachedModuleNodeId(
              domainIdentity.toKey(),
              ModuleId.make("domain-api-contracts"),
            ),
            reason: "owns-module" as const,
          },
        ],
      }),
      message: "does not match an attached module ownership relationship",
    },
  ] as const;

  it("should reject invalid identities and ownership relationships during checked construction", () => {
    invalidBlueprints.forEach(({ mutate, name }) => {
      expect(
        () => new Blueprint(mutate(makeUnsortedBlueprint())),
        name,
      ).toThrow("Schema validation failed");
    });
  });

  it("should reject invalid ownership relationships when decoding", async () => {
    const blueprint = makeUnsortedBlueprint();
    const invalid = {
      nodes: blueprint.nodes,
      edges: blueprint.edges.filter((edge) => edge.id !== "m-edge"),
    };

    await expect(
      Schema.decodeUnknownPromise(Blueprint)(invalid),
    ).rejects.toThrow("must have exactly one owns-module edge");
  });
});
