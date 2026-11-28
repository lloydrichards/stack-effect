import { Apply, type ApplyResult } from "@repo/domain/Apply";
import type { Blueprint } from "@repo/domain/Blueprint";
import { isCustomCatalogSource } from "@repo/domain/Catalog";
import { FinalizeReport, type FinalizeScript } from "@repo/domain/Finalize";
import type { Plan, PlanConflict } from "@repo/domain/Plan";
import type { Selection } from "@repo/domain/Selection";
import type { StackConfig } from "@repo/domain/StackConfig";
import { Applier, ApplyWorkspaces } from "@repo/scaffold/Apply";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { Finalizer, scriptKey } from "@repo/scaffold/Finalize";
import { Planner } from "@repo/scaffold/Plan";
import { Confirm, MultiSelect } from "@repo/tui";
import {
  Array as Arr,
  Console,
  Context,
  Effect,
  Layer,
  Result,
  Schema,
  Stream,
} from "effect";
import { Ansi, Box } from "effect-boxes";
import { DryRunPreview } from "../components/DryRunPreview";
import { NextStepsPreview } from "../components/NextStepsPreview";
import * as ScaffoldTree from "../components/ScaffoldTree";
import {
  askOr,
  type Confirmation,
  RunMode,
  type PreviewMode,
  type ScriptPolicy,
  type WriteMode,
} from "../lib/runMode";
import {
  CatalogSelection,
  customSourcesOf,
  sourceLabel,
  trustNotes,
} from "./CatalogSelection";

export class ScaffoldAborted extends Schema.TaggedError<ScaffoldAborted>()(
  "ScaffoldAborted",
  { message: Schema.String, retry: Schema.optional(Schema.Boolean) },
) {}

class DependencyConflict extends Schema.TaggedError<DependencyConflict>()(
  "DependencyConflict",
  { message: Schema.String },
) {}

class FinalizeScriptError extends Schema.TaggedError<FinalizeScriptError>()(
  "FinalizeScriptError",
  { message: Schema.String, failed: Schema.Number },
) {}

/** What to scaffold and where; the run mode says how. */
type ScaffoldRequest = {
  readonly selection: Selection;
  readonly repositoryRoot: string;
  readonly config: StackConfig;
  readonly createCommand?: string | undefined;
};

const heading = (title: string) =>
  Box.text(title).pipe(Box.annotate(Ansi.combine(Ansi.bold, Ansi.cyan)));

const blueprintBoxOf = (blueprint: Blueprint) => {
  const formatted = ScaffoldTree.formatBlueprint(blueprint);
  return Box.vsep([heading(formatted.title), formatted.content], 1, Box.left);
};

const planBoxOf = (plan: Plan) => {
  const formatted = ScaffoldTree.formatPlan(plan);
  return Box.vsep(
    [
      heading(formatted.title),
      Box.text(formatted.summary),
      formatted.tree,
      formatted.legend,
    ],
    1,
    Box.left,
  );
};

const conflictGroupsFrom = (plan: Plan) =>
  Array.from(
    Map.groupBy(plan.conflicts, (conflict) => conflict.path),
    ([path, conflicts]) => ({ path, conflicts }),
  );

type ConflictGroup = ReturnType<typeof conflictGroupsFrom>[number];

const decisionFor = (
  path: ConflictGroup["path"],
  override: boolean,
): Apply["decisions"][number] => ({
  path,
  value: override ? "override" : "skip",
});

const decideConflict = Effect.fnUntraced(function* (
  { path, conflicts }: ConflictGroup,
  confirm: Confirmation,
  planBox: Box.Box<Ansi.AnsiStyle>,
) {
  const dependencyConflicts = conflicts.filter(
    (conflict): conflict is Extract<PlanConflict, { _tag: "dependencies" }> =>
      conflict._tag === "dependencies",
  );
  if (dependencyConflicts.length > 0) {
    return yield* new DependencyConflict({
      message: `Cannot apply modules with required dependency conflicts at ${path}: ${dependencyConflicts
        .map(ScaffoldTree.describeDependencyConflict)
        .join(
          ", ",
        )}. Resolve the dependency versions before applying these modules.`,
    });
  }
  const override = yield* askOr(
    confirm,
    Confirm({
      message: `Conflict at ${path} (${conflicts
        .map((conflict) => conflict._tag)
        .join(", ")}). Override?`,
      children: planBox,
      initial: false,
    }),
    false,
  );
  return decisionFor(path, override);
});

const previewScaffold = Effect.fnUntraced(function* (
  request: ScaffoldRequest,
  blueprint: Blueprint,
  plan: Plan,
  { showFiles }: PreviewMode,
) {
  const workspaces = yield* ApplyWorkspaces;
  const finalizer = yield* Finalizer;
  const { loaded } = yield* CatalogSelection;

  const workspace = yield* workspaces.fromRepository({
    repositoryRoot: request.repositoryRoot,
    baseline: plan.baseline,
  });
  const preview = yield* workspace.materialize(
    new Apply({
      plan,
      decisions: conflictGroupsFrom(plan).map(({ path }) =>
        decisionFor(path, false),
      ),
    }),
  );
  const scripts = yield* finalizer.scripts(blueprint, {
    ...request,
    baseline: plan.baseline,
  });

  yield* Console.log(
    Box.renderPrettySync(
      DryRunPreview({
        blueprint: ScaffoldTree.formatBlueprint(blueprint).content,
        plan: ScaffoldTree.formatPlan(plan),
        changes: {
          apply: preview.apply,
          generatedFiles: showFiles ? preview.files : undefined,
        },
        finalize: { scripts, createCommand: request.createCommand },
      }),
    ),
  );
  yield* Effect.forEach(trustNotes(scripts, loaded), (note) =>
    Console.log(note),
  );
});

const auditLine = (
  script: FinalizeScript,
  loaded: (typeof CatalogSelection.Service)["loaded"],
) =>
  `  ${script.label}: ${script.command} (${script.origin}${
    isCustomCatalogSource(script.source) && script.source !== undefined
      ? `, ${sourceLabel(loaded, script.source)}`
      : ""
  })`;

const promptForScripts = (
  scripts: ReadonlyArray<FinalizeScript>,
  loaded: (typeof CatalogSelection.Service)["loaded"],
) => {
  const customSources = customSourcesOf(scripts);
  return MultiSelect({
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
              scripts.flatMap(({ source }) =>
                source === undefined ? [] : [source],
              ),
            ).map((source) => ({
              key: `source:${source}`,
              label: `From ${sourceLabel(loaded, source)}`,
            })),
            { key: "config", label: "Install & Format" },
          ],
    choices: scripts.map((script) => ({
      title: script.command,
      description: script.origin,
      value: script,
      selected: !isCustomCatalogSource(script.source),
      group:
        customSources.length === 0 || script.source === undefined
          ? script.phase
          : `source:${script.source}`,
    })),
  });
};

// NOTE: Non-interactive runs still print the script list as an audit trail.
const selectScripts = Effect.fnUntraced(function* (
  scripts: ReadonlyArray<FinalizeScript>,
  policy: ScriptPolicy,
) {
  const { loaded } = yield* CatalogSelection;
  if (policy === "prompt") return yield* promptForScripts(scripts, loaded);

  yield* Console.log("\nFinalize scripts:");
  yield* Effect.forEach(scripts, (script) =>
    Console.log(auditLine(script, loaded)),
  );
  if (policy === "all") return scripts;

  yield* Effect.forEach(trustNotes(scripts, loaded), (note) =>
    Console.error(note),
  );
  return scripts.filter((script) => !isCustomCatalogSource(script.source));
});

const runScript = Effect.fnUntraced(function* (
  script: FinalizeScript,
  repositoryRoot: string,
) {
  const finalizer = yield* Finalizer;
  yield* Console.log(`  [>] ${script.label}: ${script.command}`);
  const execution = yield* finalizer.executeScoped(script, repositoryRoot);

  yield* Stream.runForEach(execution.output, (line) =>
    Console.log(`      ${line}`),
  );

  const result = yield* execution.result;
  yield* Console.log(
    Result.isSuccess(result) ? "  [+] success" : "  [x] failure",
  );
  if (Result.isFailure(result)) {
    yield* Console.log(`      Error: ${result.failure.error}`);
  }
  return result;
}, Effect.scoped);

const runScripts = Effect.fnUntraced(function* (
  scripts: ReadonlyArray<FinalizeScript>,
  repositoryRoot: string,
) {
  yield* Console.log("\nRunning finalize scripts...");
  const results = yield* Effect.forEach(
    scripts,
    (script) => runScript(script, repositoryRoot),
    { concurrency: 1 },
  );

  const report = new FinalizeReport({ results });
  if (report.failed > 0) {
    yield* Console.log(
      `\n${report.failed} finalize script(s) failed. See errors above.`,
    );
    return yield* new FinalizeScriptError({
      message: `${report.failed} finalize script(s) failed.`,
      failed: report.failed,
    });
  }
});

const nextStepsOf = (
  { selection, config }: ScaffoldRequest,
  result: ApplyResult,
  catalogSteps: ReadonlyArray<string>,
) => {
  const isWorkspaceInit = selection.targets.some(
    (target) => target.identity.kind === "workspace",
  );
  const devCommand =
    config.runtimeName === "deno"
      ? "deno task dev:all"
      : `${config.packageManagerName} run dev`;

  return [
    ...(isWorkspaceInit
      ? [`cd ${config.name}`, `${config.packageManagerName} install`]
      : []),
    ...(result.skipped.length > 0 ? ["Resolve conflicts listed above"] : []),
    ...catalogSteps,
    ...(isWorkspaceInit ? [] : [devCommand]),
  ];
};

const finalizeScaffold = Effect.fnUntraced(function* (
  request: ScaffoldRequest & { readonly baseline?: Plan["baseline"] },
  blueprint: Blueprint,
  result: ApplyResult,
  policy: ScriptPolicy,
) {
  const finalizer = yield* Finalizer;
  const scripts = yield* finalizer.scripts(blueprint, request);
  if (scripts.length === 0) return;

  const selectedKeys = new Set(
    (yield* selectScripts(scripts, policy)).map(scriptKey),
  );
  const isSelected = (script: FinalizeScript) =>
    selectedKeys.has(scriptKey(script));

  if (selectedKeys.size === 0) {
    yield* Console.log("\nNo finalize scripts selected. Skipping.");
  } else {
    yield* runScripts(scripts.filter(isSelected), request.repositoryRoot);
  }

  const catalogSteps = yield* finalizer.collectNextSteps(blueprint, request);
  yield* Console.log(
    Box.renderPrettySync(
      NextStepsPreview({
        conflicts: result.skipped,
        skippedScripts: scripts
          .filter((script) => !isSelected(script))
          .map(({ label, command }) => ({ label, command })),
        steps: nextStepsOf(request, result, catalogSteps),
      }),
    ),
  );
});

const writeScaffold = Effect.fnUntraced(function* (
  request: ScaffoldRequest,
  blueprint: Blueprint,
  plan: Plan,
  mode: WriteMode,
) {
  const applier = yield* Applier;
  const planBox = planBoxOf(plan);

  const decisions = yield* Effect.forEach(conflictGroupsFrom(plan), (group) =>
    decideConflict(group, mode.confirm, planBox),
  );

  const proceed = yield* askOr(
    mode.confirm,
    Confirm({ message: "Apply changes?", children: planBox, initial: true }),
    true,
  );
  if (!proceed) {
    yield* Console.log("Aborted.\n\n");
    return yield* new ScaffoldAborted({
      message: "User aborted the scaffold process.",
    });
  }

  const result = yield* applier.apply({
    apply: new Apply({ plan, decisions }),
    repositoryRoot: request.repositoryRoot,
  });

  yield* Console.log(`\nCreated: ${result.created.length} files`);
  yield* Console.log(`Modified: ${result.modified.length} files`);
  yield* Console.log(`Skipped: ${result.skipped.length} files`);
  if (result.failed.length > 0) {
    yield* Console.log(`Failed: ${result.failed.length} files`);
  }

  yield* finalizeScaffold(
    { ...request, baseline: plan.baseline },
    blueprint,
    result,
    mode.scripts,
  );
});

export class ScaffoldPipeline extends Context.Service<ScaffoldPipeline>()(
  "ScaffoldPipeline",
  {
    make: Effect.gen(function* () {
      const run = Effect.fn("ScaffoldPipeline.run")(function* (
        request: ScaffoldRequest,
        mode: RunMode,
      ) {
        const blueprintResolver = yield* BlueprintResolver;
        const planner = yield* Planner;

        const blueprint = yield* blueprintResolver.resolve(
          request.selection,
          request.config,
        );

        if (mode._tag === "write") {
          const proceed = yield* askOr(
            mode.confirm,
            Confirm({
              message: "Continue with these changes?",
              children: blueprintBoxOf(blueprint),
              initial: true,
            }),
            true,
          );
          if (!proceed) {
            yield* Console.log("Lets try again.\n\n");
            return yield* new ScaffoldAborted({
              message: "User aborted the scaffold process.",
              retry: true,
            });
          }
        }

        const plan = yield* planner.build({
          blueprint,
          repositoryRoot: request.repositoryRoot,
          config: request.config,
        });

        return yield* RunMode.match(mode, {
          preview: (preview) =>
            previewScaffold(request, blueprint, plan, preview),
          write: (write) => writeScaffold(request, blueprint, plan, write),
        });
      });

      return { run } as const;
    }),
  },
) {
  static layer = Layer.effect(ScaffoldPipeline, ScaffoldPipeline.make);
}
