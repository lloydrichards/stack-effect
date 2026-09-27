import { Effect, Option } from "effect";
import { Command } from "effect/unstable/cli";
import { add } from "./commands/add";
import { catalog } from "./commands/catalog";
import { create } from "./commands/create";
import { graph } from "./commands/graph";
import { init } from "./commands/init";
import { parsePlanInput, ParsedPlanInput, plan } from "./commands/plan";
import { schema } from "./commands/schema";
import { resolveNameAndRoot } from "./lib/project";
import { ConfigureService } from "./service/ConfigureService";
import { CommandServicesLayer } from "./services";

const requireExistingConfig = (root: Option.Option<string>) =>
  Effect.gen(function* () {
    const configure = yield* ConfigureService;
    yield* configure.readConfig(Option.getOrElse(root, () => process.cwd()));
  });

const inspectProjectConfig = (
  name: Option.Option<string>,
  root: Option.Option<string>,
) =>
  Option.isNone(name)
    ? Effect.void
    : Effect.gen(function* () {
        const configure = yield* ConfigureService;
        const { repoRoot } = yield* resolveNameAndRoot(name.value, root);
        yield* configure.readConfig(repoRoot).pipe(
          Effect.asVoid,
          Effect.catchTag("MissingConfigError", () => Effect.void),
        );
      });

export const stackEffectCommand = Command.make("stack-effect").pipe(
  Command.withDescription(
    "Interactive CLI for scaffolding and extending Effect-powered TypeScript projects. Compose targets (server, client, cli, package) with incrementally-addable modules.",
  ),
  Command.withSubcommands([
    init.pipe(
      Command.provide(CommandServicesLayer),
      Command.provideEffectDiscard((flags) =>
        inspectProjectConfig(flags.name, flags.root),
      ),
    ),
    create.pipe(
      Command.provide(CommandServicesLayer),
      Command.provideEffectDiscard((flags) =>
        inspectProjectConfig(flags.name, flags.root),
      ),
    ),
    add.pipe(
      Command.provide(CommandServicesLayer),
      Command.provideEffectDiscard((flags) =>
        requireExistingConfig(flags.root),
      ),
    ),
    graph.pipe(Command.provide(CommandServicesLayer)),
    plan.pipe(
      Command.provide(CommandServicesLayer),
      Command.provideEffect(ParsedPlanInput, (flags) =>
        parsePlanInput(flags.root),
      ),
    ),
    schema.pipe(Command.provide(CommandServicesLayer)),
    catalog,
  ]),
);
