import { Apply } from "@repo/domain/Apply";
import type { Plan } from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import {
  ApplyService,
  BlueprintService,
  type FinalizeConfig,
  FinalizeService,
  PlanService,
  ScaffoldFormatter,
} from "@repo/scaffold";
import { Console, Context, Data, Effect, Layer } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box } from "effect-boxes";
import { Border } from "../components/Border";
import { Padding } from "../components/Padding";

export class ScaffoldAborted extends Data.TaggedError("ScaffoldAborted")<{
  message: string;
  retry?: boolean;
}> {}

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
        yes,
        dryRun,
        config,
      }: {
        selection: typeof Selection.Type;
        repoRoot: string;
        yes: boolean;
        dryRun: boolean;
        config: typeof StackConfig.Type;
      }) =>
        Effect.gen(function* () {
          const formatter = yield* ScaffoldFormatter;
          const blueprintService = yield* BlueprintService;
          const planService = yield* PlanService;
          const finalizeService = yield* FinalizeService;

          // Blueprint
          const blueprint = yield* blueprintService.resolve(selection);

          const bp = yield* formatter.formatBlueprint(blueprint);

          const blueprintBox = Box.vcat(
            [
              Box.text(bp.title).pipe(
                Box.annotate(Ansi.combine(Ansi.bold, Ansi.cyan)),
              ),
              Box.emptyBox(1, 0),
              ...(bp.targets.length > 0
                ? [
                    Box.text(bp.targetsLabel).pipe(Box.annotate(Ansi.bold)),
                    Box.text(bp.targets.join("\n")),
                  ]
                : []),
            ],
            Box.left,
          ).pipe(Padding(1, 2), Border);

          yield* Console.log(Box.renderPrettySync(blueprintBox));

          const confirm = yield* Prompt.confirm({
            message: "Continue with these changes?",
            initial: true,
          });

          if (!confirm) {
            yield* Console.log("Lets try again.\n\n");
            return yield* new ScaffoldAborted({
              message: "User aborted the scaffold process.",
              retry: true,
            });
          }

          // Plan
          const plan = yield* planService.build({
            blueprint,
            repoRoot,
            config,
          });
          const pl = yield* formatter.formatPlan(plan);

          const planBox = Box.vcat(
            [
              Box.text(pl.title).pipe(
                Box.annotate(Ansi.combine(Ansi.bold, Ansi.cyan)),
              ),
              Box.emptyBox(1, 0),
              Box.text(pl.legend).pipe(Box.annotate(Ansi.dim)),
              Box.text(pl.summary),
              Box.emptyBox(1, 0),
              Box.text(pl.tree.join("\n")),
            ],
            Box.left,
          ).pipe(Padding(1, 2), Border);

          yield* Console.log(Box.renderPrettySync(planBox));

          // Dry run exits here
          if (dryRun) {
            const finalizeConfig: FinalizeConfig = {
              config,
              repoRoot,
            };
            const previewScripts = yield* finalizeService.preview(
              blueprint,
              finalizeConfig,
            );
            if (previewScripts.length > 0) {
              yield* Console.log("\nFinalize scripts:");
              for (const script of previewScripts) {
                yield* Console.log(`  ${script.label}: ${script.command}`);
              }
            }
            yield* Console.log("\n[dry-run] No changes written.");
            return yield* new ScaffoldAborted({
              message: "Dry run completed. No changes written.",
            });
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
              yield* Console.log("Aborted.\n\n");
              return yield* new ScaffoldAborted({
                message: "User aborted the scaffold process.",
              });
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

          // Finalize
          const finalizeConfig: FinalizeConfig = {
            config,
            repoRoot,
          };
          const previewScripts = yield* finalizeService.preview(
            blueprint,
            finalizeConfig,
          );
          if (previewScripts.length > 0) {
            yield* Console.log("\nRunning finalize scripts...");
            const report = yield* finalizeService.run(
              blueprint,
              finalizeConfig,
            );
            for (const r of report.results) {
              const icon = r.status === "success" ? "+" : "x";
              yield* Console.log(`  [${icon}] ${r.label}: ${r.command}`);
              if (r.error) {
                yield* Console.log(`      Error: ${r.error}`);
              }
            }
            if (report.failed > 0) {
              yield* Console.log(
                `\n${report.failed} finalize script(s) failed. See errors above.`,
              );
            }
          }
        });

      return { run } as const;
    }),
  },
) {
  static layer = Layer.effect(ScaffoldPipeline, ScaffoldPipeline.make);
}
