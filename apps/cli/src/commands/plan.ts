import { PlanRequest } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import {
  BlueprintService,
  FinalizeService,
  PlanService,
  RecipeService,
  renderPlanForLlm,
  ScaffoldFormatter,
} from "@repo/scaffold";
import {
  Array as Arr,
  Console,
  Context,
  Effect,
  FileSystem,
  Match,
  Option,
  Schema,
  Stream,
} from "effect";
import { Box } from "effect-boxes";
import { Stdio } from "effect/Stdio";
import { Command, Flag } from "effect/unstable/cli";
import { catalogFlag, rootFlag } from "../flags";
import { CatalogSelection } from "../service/CatalogSelection";
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

const formatFlag = Flag.Literals("format", ["llm", "raw", "tree"]).pipe(
  Flag.optional,
  Flag.withAlias("f"),
  Flag.withDescription("Output format: llm (default), raw, or tree"),
);

const outputFlag = Flag.String("output").pipe(
  Flag.optional,
  Flag.withAlias("o"),
  Flag.withDescription("Write output to a file instead of stdout"),
);

export class ParsedPlanInput extends Context.Service<
  ParsedPlanInput,
  {
    readonly input: typeof PlanRequest.Type;
    readonly config: typeof StackConfig.Type;
  }
>()("ParsedPlanInput") {}

export const parsePlanInput = (root: Option.Option<string>) =>
  Effect.gen(function* () {
    const repoRoot = Option.getOrElse(root, () => process.cwd());
    const stdio = yield* Stdio;
    const stdin = yield* stdio.stdin.pipe(Stream.decodeText(), Stream.mkString);
    const input = yield* Schema.decodeEffect(
      Schema.fromJsonString(PlanRequest),
    )(stdin);
    const configure = yield* ConfigureService;
    const config =
      input.config ??
      (yield* configure
        .readConfig(repoRoot)
        .pipe(
          Effect.catchTag("MissingConfigError", () =>
            Effect.fail(
              "No config found. Provide 'config' in stdin or ensure stack.effect.json exists at --root.",
            ),
          ),
        ));
    return { input, config };
  });

export const plan = Command.make(
  "plan",
  {
    root: rootFlag,
    format: formatFlag,
    output: outputFlag,
    catalog: catalogFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const repoRoot = Option.getOrElse(flags.root, () => process.cwd());
      const format = Option.getOrElse(flags.format, () => "llm" as const);

      const { input, config } = yield* ParsedPlanInput;
      const { loaded } = yield* CatalogSelection;
      const sources = loaded.map(({ name, sourceUrl, digest, freshness }) => ({
        name,
        url: sourceUrl,
        digest,
        freshness,
      }));

      const blueprintService = yield* BlueprintService;
      const blueprint = yield* blueprintService.resolve(
        input.selection,
        config,
      );
      const recipes = yield* RecipeService;
      const createCommand = recipes.renderCreateCommand({
        config,
        selection: input.selection,
      });

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
          Effect.orElseSucceed(
            () => [] as Array<{ label: string; command: string }>,
          ),
        );

      const finalize = Arr.map(scripts, (script) => ({
        label: script.label,
        command: script.command,
      }));
      const createFinalizeCommand = {
        label: "Create equivalent project",
        command: createCommand,
      };
      const finalizeWithCreateCommand = [createFinalizeCommand, ...finalize];

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
            Box.vsep(
              [
                Box.hcat(
                  [Box.text(formattedPlan.summary), formattedPlan.tree],
                  Box.left,
                ),
                Box.text(`Create command: ${createCommand}`),
              ],
              1,
              Box.left,
            ),
          ),
        ),
        Match.when("llm", () =>
          Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
            sources,
            ...renderPlanForLlm({
              outcomes: planResult.outcomes,
              conflicts: planResult.conflicts,
              finalize: finalizeWithCreateCommand,
              summary,
              tree,
            }),
          }),
        ),
        Match.when("raw", () =>
          Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
            sources,
            baseline: planResult.baseline,
            outcomes: planResult.outcomes,
            conflicts: planResult.conflicts,
            summary,
            createCommand,
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
    "Read a Selection (and optional config) from stdin, resolve dependencies, and output a structured plan. When stdin omits config, --root must contain stack.effect.json. Designed for LLM and CI consumption.",
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
