import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import {
  ModuleId,
  TargetIdentity,
  TargetKey,
  TargetKind,
} from "@repo/domain/Catalog";
import { describe, expect, it } from "vitest";
import { attachedModuleIdsByTarget } from "./ContributionResolver";

const target = (id: string, kind: string, name: string) => ({
  _tag: "target" as const,
  id: TargetKey.make(id),
  identity: new TargetIdentity({
    kind: TargetKind.make(kind),
    name,
  }),
});

const attached = (targetId: string, moduleId: string) => ({
  _tag: "attached-module" as const,
  id: toAttachedModuleNodeId(TargetKey.make(targetId), ModuleId.make(moduleId)),
  targetId: TargetKey.make(targetId),
  moduleId: ModuleId.make(moduleId),
});

describe("attachedModuleIdsByTarget", () => {
  it("groups zero, one, multiple, and unknown IDs by owning target only", () => {
    const api = target("apps/server-api", "server", "api");
    const web = target("apps/client-react-web", "client-react", "web");
    const blueprint = new Blueprint({
      nodes: [
        api,
        web,
        attached(api.id, "workspace-git-hooks-lefthook"),
        attached(api.id, "unknown-module"),
        attached(web.id, "workspace-git-hooks-husky"),
      ],
      edges: [
        {
          id: "api-lefthook",
          from: api.id,
          to: `${api.id}#workspace-git-hooks-lefthook`,
          reason: "owns-module",
        },
        {
          id: "api-unknown",
          from: api.id,
          to: `${api.id}#unknown-module`,
          reason: "owns-module",
        },
        {
          id: "web-husky",
          from: web.id,
          to: `${web.id}#workspace-git-hooks-husky`,
          reason: "owns-module",
        },
      ],
    });

    const grouped = attachedModuleIdsByTarget(blueprint);

    expect(grouped.get(api.id)).toEqual([
      "workspace-git-hooks-lefthook",
      "unknown-module",
    ]);
    expect(grouped.get(web.id)).toEqual(["workspace-git-hooks-husky"]);
    expect(grouped.get(TargetKey.make("packages/empty"))).toBeUndefined();
  });
});
