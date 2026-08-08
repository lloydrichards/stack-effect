import { Array as Arr, Console, Effect, Option, pipe, Record } from "effect";
import { CliOutput, Command, type HelpDoc } from "effect/unstable/cli";

export interface CliReferenceFlag {
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly type: string;
  readonly description: string | null;
  readonly required: boolean;
}

export interface CliReferenceArgument {
  readonly name: string;
  readonly type: string;
  readonly description: string | null;
  readonly required: boolean;
  readonly variadic: boolean;
}

interface CliReferenceSubcommand {
  readonly name: string;
  readonly shortDescription: string | null;
  readonly description: string;
}

export interface CliReferenceCommand {
  readonly path: ReadonlyArray<string>;
  readonly description: string;
  readonly usage: string;
  readonly flags: ReadonlyArray<CliReferenceFlag>;
  readonly globalFlags: ReadonlyArray<CliReferenceFlag>;
  readonly arguments: ReadonlyArray<CliReferenceArgument>;
  readonly subcommands: ReadonlyArray<CliReferenceSubcommand>;
  readonly examples: ReadonlyArray<{
    readonly command: string;
    readonly description: string | null;
  }>;
}

export interface CliReference {
  readonly name: string;
  readonly version: string;
  readonly commands: ReadonlyArray<CliReferenceCommand>;
}

const longOptions = (command: string): ReadonlyArray<string> =>
  Array.from(command.matchAll(/--[a-z0-9-]+/g), ([option]) => option.slice(2));

export const validateCliReference = (
  reference: CliReference,
): ReadonlyArray<string> => {
  const paths = reference.commands.map((command) => command.path.join(" "));
  const duplicatePaths = pipe(
    paths,
    Arr.groupBy((path) => path),
    Record.filter((paths) => paths.length > 1),
    Record.keys,
  );
  const commandErrors = reference.commands.flatMap((command) => {
    const path = command.path.join(" ");
    const documentedOptions = new Set(
      [...command.flags, ...command.globalFlags].map((flag) => flag.name),
    );
    const undocumentedFlags = [...command.flags, ...command.globalFlags]
      .filter((flag) => flag.description === null)
      .map((flag) => `${path}: --${flag.name} has no description`);
    const unknownExampleOptions = command.examples.flatMap((example) =>
      longOptions(example.command)
        .filter((option) => !documentedOptions.has(option))
        .map(
          (option) => `${path}: example uses undocumented option --${option}`,
        ),
    );

    return [
      ...(command.description.length === 0
        ? [`${path}: command has no description`]
        : []),
      ...undocumentedFlags,
      ...unknownExampleOptions,
    ];
  });

  return [
    ...duplicatePaths.map((path) => `${path}: duplicate command path`),
    ...commandErrors,
  ];
};

const silentConsole: Console.Console = Object.assign(
  Object.create(globalThis.console),
  { log: () => undefined },
);

const commandPaths = (
  command: Command.Command.Any,
  parentPath: ReadonlyArray<string> = [],
): ReadonlyArray<ReadonlyArray<string>> => {
  const path = [...parentPath, command.name];
  const descendants = command.subcommands.flatMap((group) =>
    group.commands
      .filter((subcommand) => !subcommand.unlisted)
      .flatMap((subcommand) => commandPaths(subcommand, path)),
  );
  return [path, ...descendants];
};

const flagReference = (flag: HelpDoc.FlagDoc): CliReferenceFlag => ({
  name: flag.name,
  aliases: flag.aliases,
  type: flag.type,
  description: Option.getOrNull(flag.description),
  required: flag.required,
});

const commandReference = (
  path: ReadonlyArray<string>,
  help: HelpDoc.HelpDoc,
): CliReferenceCommand => ({
  path,
  description: help.description,
  usage: help.usage,
  flags: help.flags.map(flagReference),
  globalFlags: (help.globalFlags ?? []).map(flagReference),
  arguments: (help.args ?? []).map((argument) => ({
    name: argument.name,
    type: argument.type,
    description: Option.getOrNull(argument.description),
    required: argument.required,
    variadic: argument.variadic,
  })),
  subcommands: (help.subcommands ?? []).flatMap((group) =>
    group.commands.map((command) => ({
      name: command.name,
      shortDescription: command.shortDescription ?? null,
      description: command.description,
    })),
  ),
  examples: (help.examples ?? []).map((example) => ({
    command: example.command,
    description: example.description ?? null,
  })),
});

const collectCommandHelp = <Name extends string, Input, ContextInput, E, R>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
  version: string,
  path: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    // Effect CLI exposes structured help through its public formatter boundary.
    // Capture that synchronous callback while running the regular --help path.
    let captured: HelpDoc.HelpDoc | undefined;
    const formatter: CliOutput.Formatter = {
      ...CliOutput.defaultFormatter({ colors: false }),
      formatHelpDoc: (help) => {
        captured = help;
        return "";
      },
    };

    yield* Command.runWith(command, { version })([
      ...path.slice(1),
      "--help",
    ]).pipe(
      Effect.provideService(CliOutput.Formatter, formatter),
      Effect.provideService(Console.Console, silentConsole),
    );

    if (captured === undefined) {
      return yield* Effect.die(
        `Effect CLI did not produce help for ${path.join(" ")}`,
      );
    }

    return commandReference(path, captured);
  });

export const collectCliReference = <
  Name extends string,
  Input,
  ContextInput,
  E,
  R,
>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
  version: string,
) =>
  Effect.gen(function* () {
    const commands = yield* Effect.forEach(
      commandPaths(command),
      (path) => collectCommandHelp(command, version, path),
      { concurrency: 1 },
    );

    return {
      name: command.name,
      version,
      commands,
    } satisfies CliReference;
  });
