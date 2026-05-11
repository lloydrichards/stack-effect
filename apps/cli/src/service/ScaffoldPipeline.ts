import { Apply } from "@repo/domain/Apply";
import { FinalizeReport } from "@repo/domain/Finalize";
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
import { Console, Context, Data, Effect, Layer, Result, Stream } from "effect";
import { Ansi, Box } from "effect-boxes";
import { Confirm } from "../components/Confirm";

class ScaffoldAborted extends Data.TaggedError("ScaffoldAborted")<{
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
                  : yield* Confirm({
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

          const blueprintBox = yield* formatter.formatBlueprint(blueprint);

          if (!yes) {
            const confirm = yield* Confirm({
              message: "Continue with these changes?",
              children: blueprintBox,
              initial: true,
            });

            if (!confirm) {
              yield* Console.log("Lets try again.\n\n");
              return yield* new ScaffoldAborted({
                message: "User aborted the scaffold process.",
                retry: true,
              });
            }
          }

          // Plan
          const plan = yield* planService.build({
            blueprint,
            repoRoot,
            config,
          });
          const pl = yield* formatter.formatPlan(plan);

          const planBox = Box.vsep(
            [
              Box.text(pl.title).pipe(
                Box.annotate(Ansi.combine(Ansi.bold, Ansi.cyan)),
              ),
              Box.text(pl.summary),
              pl.tree,
              pl.legend,
            ],
            1,
            Box.left,
          );

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
            const proceed = yield* Confirm({
              message: "Apply changes?",
              children: planBox,
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
            const executables = yield* finalizeService.run(
              blueprint,
              finalizeConfig,
            );

            const results = yield* Effect.forEach(
              executables,
              ({ script, execute }) =>
                Effect.scoped(
                  Effect.gen(function* () {
                    yield* Console.log(
                      `  [>] ${script.label}: ${script.command}`,
                    );
                    const execution = yield* execute();

                    yield* execution.output.pipe(
                      Stream.tap((line) => Console.log(`      ${line}`)),
                      Stream.runDrain,
                    );

                    const result = yield* execution.result;
                    const icon = Result.isSuccess(result) ? "+" : "x";
                    yield* Console.log(
                      `  [${icon}] ${Result.isSuccess(result) ? "success" : "failure"}`,
                    );
                    if (Result.isFailure(result)) {
                      yield* Console.log(
                        `      Error: ${result.failure.error}`,
                      );
                    }
                    return result;
                  }),
                ),
              { concurrency: 1 },
            );

            const report = new FinalizeReport({ results });
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
