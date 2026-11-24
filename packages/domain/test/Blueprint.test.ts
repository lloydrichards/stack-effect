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
import { Effect, SchemaIssue } from "effect";

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
  it("should order nodes and edges canonically when a Blueprint is sorted", () => {
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

  const formatIssue = SchemaIssue.makeFormatterDefault();

  it.effect.each(invalidBlueprints)(
    "should name the broken invariant when a Blueprint has $name",
    ({ mutate, message }) =>
      Effect.gen(function* () {
        const issue = yield* Effect.flip(
          Blueprint.makeEffect(mutate(makeUnsortedBlueprint())),
        );

        assert.include(formatIssue(issue), message);
      }),
  );
});
