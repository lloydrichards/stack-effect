import { StackConfig } from "@repo/domain/Scaffold";
import { Selection } from "@repo/domain/Selection";
import {
  BlueprintService,
  FinalizeService,
  PlanService,
  renderPlanForLlm,
  ScaffoldFormatter,
} from "@repo/scaffold";
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Match,
  Option,
  Schema,
  Stream,
} from "effect";
import { Stdio } from "effect/Stdio";
import { Command, Flag } from "effect/unstable/cli";
import { Box } from "effect-boxes";
import { rootFlag } from "../flags";
import { ConfigureService } from "../service/ConfigureService";

/**
 * Reads a PlanInput from stdin, runs Blueprint → Plan, and outputs structured
 * JSON suitable for LLM consumption.
 *
 * Stdin format:
 * ```json
 * {
 *   "selection": { "targets": [...] },
 *   "config": { "name": "my-app", "runtime": { "_tag": "bun" }, ... }
 * }
 * ```
 *
 * - `config` is optional when `stack.effect.json` exists at `--root`
 * - For greenfield (no existing config), `config` must be provided in stdin
 *
 * Output formats:
 * - `llm` (default): resolved file contents + natural-language edit instructions
 * - `raw`: outcomes/conflicts/finalize with composed operations
 * - `tree`: visual tree summary for human review
 */

const PlanInput = Schema.Struct({
  selection: Selection,
  config: Schema.optional(StackConfig),
});

const formatFlag = Flag.choice("format", ["llm", "raw", "tree"]).pipe(
  Flag.optional,
  Flag.withAlias("f"),
  Flag.withDescription("Output format: llm (default), raw, or tree"),
);

const outputFlag = Flag.string("output").pipe(
  Flag.optional,
  Flag.withAlias("o"),
  Flag.withDescription("Write output to a file instead of stdout"),
);

export const plan = Command.make(
  "plan",
  { root: rootFlag, format: formatFlag, output: outputFlag },
  (flags) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const repoRoot = Option.getOrElse(flags.root, () => process.cwd());
      const format = Option.getOrElse(flags.format, () => "llm" as const);

      const stdio = yield* Stdio;
      const stdin = yield* stdio.stdin.pipe(
        Stream.decodeText(),
        Stream.mkString,
      );

      const input = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(PlanInput),
      )(stdin);

      const configureService = yield* ConfigureService;
      const fileConfig = yield* configureService
        .readConfig(repoRoot)
        .pipe(Effect.catch(() => Effect.void));

      const config = input.config ?? fileConfig;
      if (!config) {
        return yield* Effect.fail(
          "No config found. Provide 'config' in stdin or ensure stack.effect.json exists at --root.",
        );
      }

      const blueprintService = yield* BlueprintService;
      const blueprint = yield* blueprintService.resolve(input.selection);

      const planService = yield* PlanService;
      const planResult = yield* planService.build({
        blueprint,
        repoRoot,
        config,
      });

      const finalizeService = yield* FinalizeService;
      const scripts = yield* finalizeService
        .preview(blueprint, { repoRoot, config })
        .pipe(
          Effect.catch(() =>
            Effect.succeed([] as Array<{ label: string; command: string }>),
          ),
        );

      const finalize = scripts.map((s) => ({
        label: s.label,
        command: s.command,
      }));

      const formatter = yield* ScaffoldFormatter;
      const formattedPlan = yield* formatter.formatPlan(planResult);
      const tree = Box.renderPlainSync(formattedPlan.tree);

      const summary = Arr.reduce(
        planResult.outcomes,
        { total: 0, create: 0, modify: 0, unchanged: 0, conflict: 0 },
        (acc, outcome) => ({
          ...acc,
          total: acc.total + 1,
          [outcome.classification]: acc[outcome.classification] + 1,
        }),
      );

      const outputText = yield* Match.value(format).pipe(
        Match.when("tree", () =>
          Box.renderPlain(
            Box.hcat(
              [Box.text(formattedPlan.summary), formattedPlan.tree],
              Box.left,
            ),
          ),
        ),
        Match.when("llm", () =>
          Schema.encodeEffect(Schema.UnknownFromJsonString)(
            renderPlanForLlm({
              outcomes: planResult.outcomes,
              conflicts: planResult.conflicts,
              finalize,
              summary,
              tree,
            }),
          ),
        ),
        Match.when("raw", () =>
          Schema.encodeEffect(Schema.UnknownFromJsonString)({
            outcomes: planResult.outcomes,
            conflicts: planResult.conflicts,
            summary,
            finalize,
            tree,
          }),
        ),
        Match.exhaustive,
      );

      yield* Option.match(flags.output, {
        onSome: Effect.fnUntraced(function* (outputPath) {
          yield* fs.writeFileString(outputPath, outputText);
          yield* Console.log(`Plan written to ${outputPath}`);
        }),
        onNone: () => Console.log(outputText),
      });
    }),
).pipe(
  Command.withDescription(
    "Read a Selection (and optional config) from stdin, resolve dependencies, and output a structured plan. Designed for LLM and CI consumption.",
  ),
  Command.withShortDescription(
    "(for LLMs) Generate a scaffold plan from stdin",
  ),
  Command.withExamples([
    {
      command:
        'echo \'{"selection":{"targets":[{"identity":{"kind":"server","name":"api"},"modules":[{"id":"server-http-api"}]}]}}\' | stack-effect plan -f raw',
      description: "Output raw plan JSON",
    },
    {
      command:
        'echo \'{"selection":{"targets":[{"identity":{"kind":"client-react","name":"web"},"modules":[{"id":"client-react-http-api"}]}]}}\' | stack-effect plan -f llm',
      description: "LLM-friendly format with resolved file contents",
    },
    {
      command:
        'echo \'{"selection":{"targets":[{"identity":{"kind":"package","name":"domain"},"modules":[{"id":"domain-api-contracts"}]}]}}\' | stack-effect plan -f tree',
      description: "Visual tree summary",
    },
  ]),
);
