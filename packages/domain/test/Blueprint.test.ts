import { assert, describe, it } from "@effect/vitest";
import {
  Blueprint,
  makeBlueprintEdge,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import {
  ModuleId,
  TargetIdentity,
  TargetKey,
  TargetKind,
} from "@repo/domain/Catalog";
import { Schema } from "effect";

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
      },
    ],
    edges: [
      makeBlueprintEdge(
        "required-module",
        toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
      ),
      makeBlueprintEdge(
        "owns-module",
        domainIdentity.toKey(),
        toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
      ),
      makeBlueprintEdge(
        "owns-module",
        serverApiIdentity.toKey(),
        toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
      ),
      makeBlueprintEdge(
        "required-target",
        toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        domainIdentity.toKey(),
      ),
    ],
  });

describe("@repo/domain Blueprint", () => {
  it("should derive canonical paths and match identity rules when names need normalization", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "My Api",
    });

    assert.strictEqual(identity.toKey(), "apps/server-my-api");
    assert.strictEqual(identity.toPath(), "apps/server-my-api");
    assert.strictEqual(
      identity.matches({ _tag: "kind", kind: TargetKind.make("server") }),
      true,
    );
    assert.strictEqual(
      identity.matches({
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "my-api",
        }),
      }),
      true,
    );
    assert.strictEqual(
      identity.matches({
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("client-react"),
          name: "my-api",
        }),
      }),
      false,
    );
  });

  it("should preserve target identity behavior when decoding", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "package",
      name: "domain",
    });

    assert.instanceOf(identity, TargetIdentity);
    assert.strictEqual(identity.toKey(), "packages/domain");
    assert.strictEqual(identity.toPath(), "packages/domain");
  });

  it("should sort nodes and edges deterministically when normalizing a Blueprint", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    assert.deepStrictEqual(
      blueprint.nodes.map((node) => node.id),
      [
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
      ],
    );
    assert.deepStrictEqual(
      blueprint.edges.map((edge) => edge.id),
      [
        "owns-module=>apps/server-api=>apps/server-api#server-http-api",
        "owns-module=>packages/domain=>packages/domain#domain-api-contracts",
        "required-module=>apps/server-api#server-http-api=>packages/domain#domain-api-contracts",
        "required-target=>apps/server-api#server-http-api=>packages/domain",
      ],
    );
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
          makeBlueprintEdge(
            "required-target",
            toAttachedModuleNodeId(
              serverApiIdentity.toKey(),
              ModuleId.make("server-http-api"),
            ),
            domainIdentity.toKey(),
          ),
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
        edges: blueprint.edges.filter(
          (edge) =>
            !(
              edge.reason === "owns-module" &&
              edge.from === domainIdentity.toKey()
            ),
        ),
      }),
      message: "must have exactly one owns-module edge",
    },
    {
      name: "multiple ownership edges for one attached module",
      mutate: (blueprint: Blueprint) => ({
        nodes: blueprint.nodes,
        edges: [
          ...blueprint.edges,
          makeBlueprintEdge(
            "owns-module",
            domainIdentity.toKey(),
            toAttachedModuleNodeId(
              domainIdentity.toKey(),
              ModuleId.make("domain-api-contracts"),
            ),
          ),
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
          makeBlueprintEdge(
            "owns-module",
            serverApiIdentity.toKey(),
            toAttachedModuleNodeId(
              domainIdentity.toKey(),
              ModuleId.make("domain-api-contracts"),
            ),
          ),
        ],
      }),
      message: "does not match an attached module ownership relationship",
    },
  ] as const;

  it("should reject invalid identities and ownership relationships during checked construction", () => {
    invalidBlueprints.forEach(({ mutate, name }) => {
      assert.throws(
        () => new Blueprint(mutate(makeUnsortedBlueprint())),
        "Schema validation failed",
        null,
        name,
      );
    });
  });

  it("should reject invalid ownership relationships when decoding", () => {
    const blueprint = makeUnsortedBlueprint();
    const invalid = {
      nodes: blueprint.nodes,
      edges: blueprint.edges.filter(
        (edge) =>
          !(
            edge.reason === "owns-module" &&
            edge.from === domainIdentity.toKey()
          ),
      ),
    };

    assert.throws(
      () => Schema.decodeSync(Blueprint)(invalid),
      "must have exactly one owns-module edge",
    );
  });
});
