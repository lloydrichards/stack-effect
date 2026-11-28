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
import { Effect, Schema, SchemaIssue } from "effect";

const domainIdentity = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "domain",
});
const serverApiIdentity = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "api",
});
const webIdentity = new TargetIdentity({
  kind: TargetKind.make("client-react"),
  name: "web",
});
const domainContracts = toAttachedModuleNodeId(
  domainIdentity.toKey(),
  ModuleId.make("domain-api-contracts"),
);
const domainErrors = toAttachedModuleNodeId(
  domainIdentity.toKey(),
  ModuleId.make("domain-errors"),
);
const serverHttpApi = toAttachedModuleNodeId(
  serverApiIdentity.toKey(),
  ModuleId.make("server-http-api"),
);

// Three targets and a target with two modules keep "the module's own target"
// and "the module's own ownership edge" distinguishable from their neighbours.
const makeUnsortedBlueprint = () =>
  new Blueprint({
    nodes: [
      {
        _tag: "attached-module",
        id: domainContracts,
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
        id: serverHttpApi,
        targetId: serverApiIdentity.toKey(),
        moduleId: ModuleId.make("server-http-api"),
      },
      {
        _tag: "target",
        id: serverApiIdentity.toKey(),
        identity: serverApiIdentity,
      },
      {
        _tag: "attached-module",
        id: domainErrors,
        targetId: domainIdentity.toKey(),
        moduleId: ModuleId.make("domain-errors"),
      },
      {
        _tag: "target",
        id: webIdentity.toKey(),
        identity: webIdentity,
      },
    ],
    edges: [
      makeBlueprintEdge("required-module", serverHttpApi, domainContracts),
      makeBlueprintEdge("owns-module", domainIdentity.toKey(), domainContracts),
      makeBlueprintEdge(
        "owns-module",
        serverApiIdentity.toKey(),
        serverHttpApi,
      ),
      makeBlueprintEdge("owns-module", domainIdentity.toKey(), domainErrors),
      makeBlueprintEdge(
        "required-target",
        serverHttpApi,
        domainIdentity.toKey(),
      ),
    ],
  });

const replaceDomainContractsOwnership = (
  blueprint: Blueprint,
  replacement: ReturnType<typeof makeBlueprintEdge>,
) => ({
  nodes: blueprint.nodes,
  edges: [
    ...blueprint.edges.filter(
      (edge) => !(edge.reason === "owns-module" && edge.to === domainContracts),
    ),
    replacement,
  ],
});

describe("@repo/domain Blueprint", () => {
  it("should order nodes and edges canonically when a Blueprint is sorted", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    assert.deepStrictEqual(
      blueprint.nodes.map((node) => node.id),
      [
        domainContracts,
        domainErrors,
        serverHttpApi,
        "client-react/web",
        "package/domain",
        "server/api",
      ],
    );
    assert.deepStrictEqual(
      blueprint.edges.map((edge) => edge.id),
      [
        "owns-module=>package/domain=>package/domain#domain-api-contracts",
        "owns-module=>package/domain=>package/domain#domain-errors",
        "owns-module=>server/api=>server/api#server-http-api",
        "required-module=>server/api#server-http-api=>package/domain#domain-api-contracts",
        "required-target=>server/api#server-http-api=>package/domain",
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
      name: "its only ownership edge coming from another target",
      mutate: (blueprint: Blueprint) =>
        replaceDomainContractsOwnership(
          blueprint,
          makeBlueprintEdge(
            "owns-module",
            serverApiIdentity.toKey(),
            domainContracts,
          ),
        ),
      message: "must have exactly one owns-module edge",
    },
    {
      name: "a non-ownership edge from its target in place of ownership",
      mutate: (blueprint: Blueprint) =>
        replaceDomainContractsOwnership(
          blueprint,
          makeBlueprintEdge(
            "required-module",
            domainIdentity.toKey(),
            domainContracts,
          ),
        ),
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

  const formatIssue = SchemaIssue.makeFormatterDefault();

  it.effect.each(invalidBlueprints)(
    "should name the broken invariant when a Blueprint has $name",
    ({ name, mutate, message }) =>
      Effect.gen(function* () {
        const issue = yield* Effect.flip(
          Blueprint.makeEffect(mutate(makeUnsortedBlueprint())),
        );

        assert.include(formatIssue(issue), message);

        if (name === "a missing ownership edge") {
          const encoded = Schema.encodeSync(Blueprint)(makeUnsortedBlueprint());
          const decoded = yield* Effect.flip(
            Schema.decodeUnknownEffect(Blueprint)({
              ...encoded,
              edges: encoded.edges.filter(
                (edge) =>
                  !(
                    edge.reason === "owns-module" && edge.to === domainContracts
                  ),
              ),
            }),
          );
          assert.include(decoded.message, message);
        }
      }),
  );
});
