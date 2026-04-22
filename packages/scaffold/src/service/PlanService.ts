import type { Blueprint as DomainBlueprint } from "@repo/domain/Blueprint";
import { Context, Effect, Layer } from "effect";
import { projectPlan } from "../plan";
import { RepoSnapshotService } from "./RepoSnapshotService";

export class PlanService extends Context.Service<PlanService>()("PlanService", {
  make: Effect.gen(function* () {
    const snapshot = yield* RepoSnapshotService;

    const build = Effect.fn("PlanService.build")(function* ({
      blueprint,
      repoRoot,
    }: {
      blueprint: DomainBlueprint;
      repoRoot: string;
    }) {
      const repoSnapshot = yield* snapshot.load({
        blueprint,
        repoRoot,
      });

      return projectPlan({ blueprint, repoSnapshot });
    });

    return { build } as const;
  }),
}) {
  static readonly layer = Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(RepoSnapshotService.layer),
  );
}
