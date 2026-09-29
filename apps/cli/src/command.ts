import { Effect, Option } from "effect";
import { Command } from "effect/unstable/cli";
import { add } from "./commands/add";
import { catalog } from "./commands/catalog";
import { create } from "./commands/create";
import { graph } from "./commands/graph";
import { init } from "./commands/init";
import { parsePlanInput, ParsedPlanInput, plan } from "./commands/plan";
import { schema } from "./commands/schema";
import { selectionFromFlags, selectionFromProject } from "./lib/catalogSources";
import { resolveNameAndRoot } from "./lib/project";
import { ConfigureService } from "./service/ConfigureService";
import { commandServicesLayer } from "./services";

const requireExistingConfig = (root: Option.Option<string>) =>
  Effect.gen(function* () {
    const configure = yield* ConfigureService;
    yield* configure.readConfig(Option.getOrElse(root, () => process.cwd()));
  });

const projectConfig = (root: Option.Option<string>) =>
  Effect.gen(function* () {
    const configure = yield* ConfigureService;
    return yield* configure
      .readConfig(Option.getOrElse(root, () => process.cwd()))
      .pipe(
        Effect.asSome,
        Effect.catchTag("MissingConfigError", () => Effect.succeedNone),
      );
  });

/** The config at the project `init` or `create` would target, if one exists. */
const targetProjectConfig = (
  name: Option.Option<string>,
  root: Option.Option<string>,
) =>
  Option.isNone(name)
    ? Effect.succeedNone
    : Effect.gen(function* () {
        const { repoRoot } = yield* resolveNameAndRoot(name.value, root);
        return yield* projectConfig(Option.some(repoRoot));
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
      Command.provide((flags) =>
        commandServicesLayer(
          selectionFromFlags(
            flags.catalog,
            targetProjectConfig(flags.name, flags.root),
          ),
        ),
      ),
      Command.provideEffectDiscard((flags) =>
        inspectProjectConfig(flags.name, flags.root),
      ),
    ),
    create.pipe(
      Command.provide((flags) =>
        commandServicesLayer(
          selectionFromFlags(flags.catalog, Effect.succeedNone),
        ),
      ),
      Command.provideEffectDiscard((flags) =>
        inspectProjectConfig(flags.name, flags.root),
      ),
    ),
    add.pipe(
      Command.provide((flags) =>
        commandServicesLayer(
          selectionFromProject(flags.catalog, projectConfig(flags.root)),
        ),
      ),
      Command.provideEffectDiscard((flags) =>
        requireExistingConfig(flags.root),
      ),
    ),
    graph.pipe(
      Command.provide((flags) =>
        commandServicesLayer(
          selectionFromProject(flags.catalog, projectConfig(flags.root)),
        ),
      ),
    ),
    plan.pipe(
      Command.provide((flags) =>
        commandServicesLayer(
          selectionFromProject(
            flags.catalog,
            Effect.map(ParsedPlanInput, ({ config }) => Option.some(config)),
          ),
        ),
      ),
      Command.provideEffect(ParsedPlanInput, (flags) =>
        parsePlanInput(flags.root),
      ),
    ),
    schema.pipe(
      Command.provide((flags) =>
        commandServicesLayer(
          selectionFromProject(flags.catalog, projectConfig(flags.root)),
        ),
      ),
    ),
    catalog,
  ]),
);
