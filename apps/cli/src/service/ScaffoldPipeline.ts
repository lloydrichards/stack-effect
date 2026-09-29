import { Apply } from "@repo/domain/Apply";
import { isCustomCatalogSource } from "@repo/domain/CatalogSource";
import { FinalizeReport } from "@repo/domain/Finalize";
import type { Plan } from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import {
  ApplyPreviewService,
  ApplyService,
  BlueprintService,
  type FinalizeConfig,
  FinalizeService,
  PlanService,
  ScaffoldFormatter,
  scriptKey,
} from "@repo/scaffold";
import { Confirm, type ConfirmOptions, MultiSelect } from "@repo/tui";
import {
  Array as Arr,
  Console,
  Context,
  Data,
  Effect,
  Layer,
  Result,
  Stream,
} from "effect";
import { Ansi, Box } from "effect-boxes";
import { DryRunPreview } from "../components/DryRunPreview";
import { NextStepsPreview } from "../components/NextStepsPreview";
import {
  CatalogSelection,
  customSourcesOf,
  sourceLabel,
  trustNotes,
} from "./CatalogSelection";

class ScaffoldAborted extends Data.TaggedError("ScaffoldAborted")<{
  message: string;
  retry?: boolean;
}> {}

export class FinalizeScriptFailure extends Data.TaggedError(
  "FinalizeScriptFailure",
)<{
  message: string;
  failed: number;
}> {}

type PreviewScript = Parameters<typeof scriptKey>[0] & {
  readonly label: string;
  readonly phase: "finalize" | "config" | "post-finalize";
  readonly origin: string;
};

const selectedScriptKeys = (
  scripts: ReadonlyArray<PreviewScript>,
): ReadonlySet<string> => new Set(scripts.map(scriptKey));

const skippedFinalizeScripts = (
  previewScripts: ReadonlyArray<PreviewScript>,
  selectedKeys: ReadonlySet<string>,
) =>
  previewScripts
    .filter((script) => !selectedKeys.has(scriptKey(script)))
    .map((script) => ({ label: script.label, command: script.command }));

const conflictGroupsFrom = (plan: Plan) =>
  Arr.map(
    Arr.dedupe(Arr.map(plan.conflicts, (conflict) => conflict.path)),
    (path) => ({
      path,
      conflicts: Arr.filter(
        plan.conflicts,
        (conflict) => conflict.path === path,
      ),
    }),
  );

const skipConflictDecisions = (plan: Plan) =>
  conflictGroupsFrom(plan).map(({ path }) => ({
    path,
    value: "skip" as const,
  }));

export const resolveConflictDecisions = <E, R>({
  plan,
  yes,
  planBox,
  confirm,
}: {
  readonly plan: Plan;
  readonly yes: boolean;
  readonly planBox: Box.Box<Ansi.AnsiStyle>;
  readonly confirm: (options: ConfirmOptions) => Effect.Effect<boolean, E, R>;
}) =>
  Effect.forEach(conflictGroupsFrom(plan), ({ path, conflicts }) =>
    Effect.gen(function* () {
      const override = yes
        ? false
        : yield* confirm({
            message: `Conflict at ${path} (${Arr.join(
              Arr.map(conflicts, (conflict) => conflict._tag),
              ", ",
            )}). Override?`,
            children: planBox,
            initial: false,
          });
      return {
        path,
        value: override ? ("override" as const) : ("skip" as const),
      };
    }),
  );

export class ScaffoldPipeline extends Context.Service<ScaffoldPipeline>()(
  "ScaffoldPipeline",
  {
    make: Effect.gen(function* () {
      const run = ({
        selection,
        repoRoot,
        yes,
        dryRun,
        showFiles,
        trust,
        config,
        createCommand,
      }: {
        selection: typeof Selection.Type;
        repoRoot: string;
        yes: boolean;
        dryRun: boolean;
        showFiles: boolean;
        trust: boolean;
        config: typeof StackConfig.Type;
        createCommand?: string;
      }) =>
        Effect.gen(function* () {
          const formatter = yield* ScaffoldFormatter;
          const blueprintService = yield* BlueprintService;
          const planService = yield* PlanService;
          const finalizeService = yield* FinalizeService;
          const applyService = yield* ApplyService;
          const applyPreviewService = yield* ApplyPreviewService;

          const blueprint = yield* blueprintService.resolve(selection, config);

          const formattedBlueprint =
            yield* formatter.formatBlueprint(blueprint);
          const blueprintBox = Box.vsep(
            [
              Box.text(formattedBlueprint.title).pipe(
                Box.annotate(Ansi.combine(Ansi.bold, Ansi.cyan)),
              ),
              formattedBlueprint.content,
            ],
            1,
            Box.left,
          );

          if (!yes && !dryRun) {
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

          if (dryRun) {
            const apply = new Apply({
              plan,
              decisions: skipConflictDecisions(plan),
            });
            const applyPreview = showFiles
              ? yield* applyPreviewService.preview({ apply, repoRoot })
              : undefined;
            const result =
              applyPreview?.apply ??
              (yield* applyService.preview({
                apply,
                repoRoot,
              }));

            const finalizeConfig: FinalizeConfig = {
              config,
              repoRoot,
            };
            const previewScripts = yield* finalizeService.preview(
              blueprint,
              finalizeConfig,
            );

            const { loaded } = yield* CatalogSelection;
            yield* Console.log(
              Box.renderPrettySync(
                DryRunPreview({
                  blueprint: formattedBlueprint.content,
                  plan: pl,
                  apply: result,
                  scripts: previewScripts,
                  createCommand,
                  generatedFiles: applyPreview?.files,
                }),
              ),
            );
            yield* Effect.forEach(trustNotes(previewScripts, loaded), (note) =>
              Console.log(note),
            );
            return;
          }

          const decisions = yield* resolveConflictDecisions({
            plan,
            yes,
            planBox,
            confirm: Confirm,
          });

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

          const finalizeConfig: FinalizeConfig = {
            config,
            repoRoot,
          };
          const previewScripts = yield* finalizeService.preview(
            blueprint,
            finalizeConfig,
          );
          if (previewScripts.length > 0) {
            const { loaded } = yield* CatalogSelection;
            const customSources = customSourcesOf(previewScripts);
            const isCustom = (script: PreviewScript) =>
              isCustomCatalogSource(script.source);
            const skipPrompt = yes || trust;

            // --yes accepts defaults: official scripts run; custom-source scripts need --trust.
            const selectedScripts = trust
              ? previewScripts
              : yes
                ? previewScripts.filter((script) => !isCustom(script))
                : yield* MultiSelect({
                    message: "Finalize scripts to run:",
                    // With custom catalogs selected, group by source so provenance is visible.
                    groups:
                      customSources.length === 0
                        ? [
                            { key: "finalize", label: "Finalize" },
                            { key: "config", label: "Install & Format" },
                            { key: "post-finalize", label: "Post-Finalize" },
                          ]
                        : [
                            ...Arr.dedupe(
                              previewScripts.flatMap(({ source }) =>
                                source === undefined ? [] : [source],
                              ),
                            ).map((source) => ({
                              key: `source:${source}`,
                              label: `From ${sourceLabel(loaded, source)}`,
                            })),
                            { key: "config", label: "Install & Format" },
                          ],
                    choices: previewScripts.map((s) => ({
                      title: `${s.command}`,
                      description: s.origin,
                      value: s,
                      selected: !isCustom(s),
                      group:
                        customSources.length === 0 || s.source === undefined
                          ? s.phase
                          : `source:${s.source}`,
                    })),
                  });

            // NOTE: Non-interactive runs still print the script list as an audit trail.
            if (skipPrompt) {
              yield* Console.log("\nFinalize scripts:");
              yield* Effect.forEach(previewScripts, (script) =>
                Console.log(
                  `  ${script.label}: ${script.command} (${script.origin}${
                    isCustom(script) && script.source !== undefined
                      ? `, ${sourceLabel(loaded, script.source)}`
                      : ""
                  })`,
                ),
              );
            }
            if (!trust && yes)
              yield* Effect.forEach(
                trustNotes(previewScripts, loaded),
                (note) => Console.error(note),
              );

            if (selectedScripts.length === 0) {
              yield* Console.log("\nNo finalize scripts selected. Skipping.");
            } else {
              yield* Console.log("\nRunning finalize scripts...");
              const executables = yield* finalizeService.run(
                blueprint,
                finalizeConfig,
              );

              const selectedKeys = selectedScriptKeys(selectedScripts);
              const filteredExecutables = executables.filter((e) =>
                selectedKeys.has(scriptKey(e.script)),
              );

              const results = yield* Effect.forEach(
                filteredExecutables,
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
                return yield* new FinalizeScriptFailure({
                  message: `${report.failed} finalize script(s) failed.`,
                  failed: report.failed,
                });
              }
            }

            const skippedScripts = skippedFinalizeScripts(
              previewScripts,
              selectedScriptKeys(selectedScripts),
            );

            const nextSteps = yield* finalizeService.collectNextSteps(
              blueprint,
              finalizeConfig,
            );

            const isWorkspaceInit = selection.targets.some(
              (t) => t.identity.kind === "workspace",
            );

            const allSteps: string[] = [];
            if (isWorkspaceInit) {
              allSteps.push(`cd ${config.name}`);
              allSteps.push(`${config.packageManagerName} install`);
            }
            if (result.skipped.length > 0) {
              allSteps.push("Resolve conflicts listed above");
            }
            allSteps.push(...nextSteps);
            if (!isWorkspaceInit) {
              allSteps.push(
                config.runtimeName === "deno"
                  ? "deno task dev:all"
                  : `${config.packageManagerName} run dev`,
              );
            }

            const preview = NextStepsPreview({
              conflicts: result.skipped,
              skippedScripts,
              steps: allSteps,
            });

            yield* Console.log(Box.renderPrettySync(preview));
          }
        });

      return { run } as const;
    }),
  },
) {
  static layer = Layer.effect(ScaffoldPipeline, ScaffoldPipeline.make);
}
