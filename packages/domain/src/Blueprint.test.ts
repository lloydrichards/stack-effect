import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ModuleId, TargetIdentity, TargetKey, TargetKind } from "./Catalog";

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
          ModuleId.make("domain-api"),
        ),
        targetId: domainIdentity.toKey(),
        moduleId: ModuleId.make("domain-api"),
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
          ModuleId.make("http-api-server"),
        ),
        targetId: serverApiIdentity.toKey(),
        moduleId: ModuleId.make("http-api-server"),
      },
      {
        _tag: "target",
        id: serverApiIdentity.toKey(),
        identity: serverApiIdentity,
      },
    ],
    edges: [
      {
        id: "z-edge",
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("http-api-server"),
        ),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api"),
        ),
        reason: "required-module",
      },
      {
        id: "m-edge",
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api"),
        ),
        reason: "owns-module",
      },
      {
        id: "n-edge",
        from: serverApiIdentity.toKey(),
        to: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("http-api-server"),
        ),
        reason: "owns-module",
      },
      {
        id: "a-edge",
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("http-api-server"),
        ),
        to: domainIdentity.toKey(),
        reason: "required-target",
      },
    ],
  });

describe("@repo/domain Blueprint", () => {
  it("should expose target identity domain methods", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "api",
    });

    expect(identity.toKey()).toBe("apps/server-api");
    expect(identity.toPath()).toBe("apps/server-api");
    expect(
      identity.matches({ _tag: "kind", kind: TargetKind.make("server") }),
    ).toBe(true);
    expect(
      identity.matches({
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "api",
        }),
      }),
    ).toBe(true);
    expect(
      identity.matches({
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("client"),
          name: "api",
        }),
      }),
    ).toBe(false);
  });

  it("should slugify user-provided names when deriving key and path", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "My Api",
    });

    expect(identity.toKey()).toBe("apps/server-my-api");
    expect(identity.toPath()).toBe("apps/server-my-api");
  });

  it("should compare exact identity rules by canonical target identity", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "My Api",
    });

    expect(
      identity.matches({
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "my-api",
        }),
      }),
    ).toBe(true);
  });

  it("should decode target identities as domain class instances", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "package",
      name: "domain",
    });

    expect(identity).toBeInstanceOf(TargetIdentity);
    expect(identity.toKey()).toBe("packages/domain");
    expect(identity.toPath()).toBe("packages/domain");
  });

  it("should sort blueprint nodes and edges deterministically", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    expect(blueprint.nodes.map((node) => node.id)).toEqual([
      toAttachedModuleNodeId(
        serverApiIdentity.toKey(),
        ModuleId.make("http-api-server"),
      ),
      toAttachedModuleNodeId(
        domainIdentity.toKey(),
        ModuleId.make("domain-api"),
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

  it("should expose helper methods for querying targets", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    expect(blueprint.hasTarget("apps/server-api")).toBe(true);
    expect(blueprint.hasTarget("apps/cli-tooling")).toBe(false);
    expect(blueprint.getTarget("packages/domain")).toEqual({
      _tag: "target",
      id: "packages/domain",
      identity: {
        kind: "package",
        name: "domain",
      },
    });
  });

  it("should expose safe helper behavior for an empty blueprint", () => {
    const blueprint = new Blueprint({
      nodes: [],
      edges: [],
    });

    expect(blueprint.hasTarget("apps/server-api")).toBe(false);
    expect(blueprint.getTarget("apps/server-api")).toBeUndefined();
  });

  it("should enforce canonical target key formatting", async () => {
    await expect(
      Schema.decodeUnknownPromise(TargetKey)("apps/server-api"),
    ).resolves.toBe("apps/server-api");
    await expect(
      Schema.decodeUnknownPromise(TargetKey)("packages/domain"),
    ).resolves.toBe("packages/domain");
    await expect(
      Schema.decodeUnknownPromise(TargetKey)("apps/server-api#http-api-server"),
    ).rejects.toThrow();
    await expect(
      Schema.decodeUnknownPromise(TargetKey)("server-api"),
    ).rejects.toThrow();
  });
});
