import { Apply } from "@repo/domain/Apply";
import { Plan } from "@repo/domain/Plan";
import type { Selection } from "@repo/domain/Selection";
import {
  ApplyService,
  BlueprintService,
  PlanService,
  ScaffoldFormatter,
} from "@repo/scaffold";
import { Console, Context, Effect, Layer, Schema } from "effect";
import { Prompt } from "effect/unstable/cli";

export class ScaffoldPipeline extends Context.Service<ScaffoldPipeline>()(
  "ScaffoldPipeline",
  {
    make: Effect.gen(function* () {
      const resolveConflicts = (plan: Plan, yes: boolean) =>
        plan.conflicts.length > 0
          ? Effect.forEach(plan.conflicts, (conflict) =>
              Effect.gen(function* () {
                const override = yes
                  ? false
                  : yield* Prompt.confirm({
                      message: `Conflict at ${conflict.path} (${conflict._tag}). Override?`,
                      initial: false,
                    });
                return {
                  path: conflict.path,
                  value: override ? ("override" as const) : ("skip" as const),
                };
              }),
            )
          : Effect.succeed([]);

      const run = ({
        selection,
        repoRoot,
        format,
        yes,
        dryRun,
      }: {
        selection: typeof Selection.Type;
        repoRoot: string;
        format: "json" | undefined;
        yes: boolean;
        dryRun: boolean;
      }) =>
        Effect.gen(function* () {
          // Blueprint
          const blueprintService = yield* BlueprintService;
          const blueprint = yield* blueprintService.resolve(selection);

          // Plan
          const planService = yield* PlanService;
          const plan = yield* planService.build({ blueprint, repoRoot });

          // Display
          const formatter = yield* ScaffoldFormatter;
          if (format === "json") {
            yield* Console.log(
              Schema.encodeSync(Schema.fromJsonString(Plan))(plan),
            );
          } else {
            yield* Console.log(yield* formatter.formatBlueprint(blueprint));
            yield* Console.log(yield* formatter.formatPlan(plan));
          }

          // Dry run exits here
          if (dryRun) {
            yield* Console.log("\n[dry-run] No changes written.");
            return;
          }

          // Resolve conflicts
          const decisions = yield* resolveConflicts(plan, yes);

          // Confirm
          if (!yes) {
            const proceed = yield* Prompt.confirm({
              message: "Apply changes?",
              initial: true,
            });
            if (!proceed) {
              yield* Console.log("Aborted.");
              return;
            }
          }

          // Apply
          const applyService = yield* ApplyService;
          const result = yield* applyService.apply({
            apply: new Apply({ plan, decisions }),
            repoRoot,
          });

          yield* Console.log(`\nCreated: ${result.created.length} files`);
          yield* Console.log(`Modified: ${result.modified.length} files`);
          yield* Console.log(`Skipped: ${result.skipped.length} files`);
          if (result.failed.length > 0) {
            yield* Console.log(`Failed: ${result.failed.length} files`);
          }
        });

      return { run } as const;
    }),
  },
) {
  static layer = Layer.effect(ScaffoldPipeline, ScaffoldPipeline.make);
}
