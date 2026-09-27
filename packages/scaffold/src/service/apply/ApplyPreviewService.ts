import { Apply, ApplyFailure, StalePlanFailure } from "@repo/domain/Apply";
import { Context, Effect, Layer } from "effect";
import {
  type ApplyPreviewFile,
  ApplyPreviewFileSchema,
} from "../../RecipePreviewSchema";
import {
  ApplyWorkspaceService,
  type MaterializedApply,
} from "./ApplyWorkspaceService";

export type { ApplyPreviewFile };
export { ApplyPreviewFileSchema };
export type ApplyPreview = MaterializedApply;

export interface ApplyPreviewServiceShape {
  readonly preview: (input: {
    readonly apply: Apply;
    readonly repoRoot: string;
  }) => Effect.Effect<ApplyPreview, ApplyFailure | StalePlanFailure, never>;
}

export class ApplyPreviewService extends Context.Service<
  ApplyPreviewService,
  ApplyPreviewServiceShape
>()("ApplyPreviewService") {
  static readonly make = Effect.gen(function* () {
    const workspaces = yield* ApplyWorkspaceService;
    const preview: ApplyPreviewServiceShape["preview"] = Effect.fn(
      "ApplyPreviewService.preview",
    )(function* ({ apply, repoRoot }) {
      const workspace = yield* workspaces.create({
        repoRoot,
        baseline: apply.plan.baseline,
      });
      return yield* workspace.materialize(apply);
    });
    return { preview } satisfies ApplyPreviewServiceShape;
  });

  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ApplyWorkspaceService.layer),
  );
}
