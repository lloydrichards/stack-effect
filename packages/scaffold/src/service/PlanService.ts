import type { Blueprint as DomainBlueprint } from "@repo/domain/Blueprint";
import { Effect } from "effect";
import { projectPlan } from "../plan";
import { RepoSnapshotLoader } from "./RepoSnapshotLoader";

export const PlanService = {
  build: Effect.fn("PlanService.build")(function* ({
    blueprint,
    repoRoot,
  }: {
    blueprint: DomainBlueprint;
    repoRoot: string;
  }) {
    const repoSnapshot = yield* RepoSnapshotLoader.load({
      blueprint,
      repoRoot,
    });

    return projectPlan({ blueprint, repoSnapshot });
  }),
};
