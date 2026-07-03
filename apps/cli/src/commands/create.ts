import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { dryRunFlag, noGitFlag, rootFlag, trustFlag, yesFlag } from "../flags";
import { CONFIG_FILENAME, ConfigureService } from "../service/ConfigureService";
import { CreateRequestService } from "../service/CreateRequestService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

const nameArg = Argument.string("project-name").pipe(Argument.optional);

const fromFlag = Flag.string("from").pipe(
  Flag.optional,
  Flag.withDescription(
    'Read create input JSON from a file path, or use "-" to read from stdin.',
  ),
);

const targetFlag = Flag.string("target").pipe(
  Flag.atLeast(1),
  Flag.optional,
  Flag.withDescription(
    "Target spec as <targetKind>/<targetName>:<moduleId>[,<moduleId>...]",
  ),
);

const runtimeFlag = Flag.choice("runtime", ["bun", "node"]).pipe(
  Flag.optional,
  Flag.withDescription("Override the default runtime"),
);

const packageManagerFlag = Flag.choice("package-manager", [
  "bun",
  "pnpm",
  "npm",
]).pipe(
  Flag.optional,
  Flag.withDescription(
    "Override the default package manager. bun implies --runtime bun; pnpm/npm imply --runtime node.",
  ),
);

const monorepoFlag = Flag.string("monorepo").pipe(
  Flag.optional,
  Flag.withDescription("Override the default monorepo tool"),
);

const lintFlag = Flag.string("lint").pipe(
  Flag.optional,
  Flag.withDescription("Override the default lint tool"),
);

const formatFlag = Flag.string("format").pipe(
  Flag.optional,
  Flag.withDescription("Override the default format tool"),
);

const testFlag = Flag.string("test").pipe(
  Flag.optional,
  Flag.withDescription("Override the default test framework"),
);

export const create = Command.make(
  "create",
  {
    name: nameArg,
    from: fromFlag,
    target: targetFlag,
    root: rootFlag,
    runtime: runtimeFlag,
    packageManager: packageManagerFlag,
    monorepo: monorepoFlag,
    lint: lintFlag,
    format: formatFlag,
    test: testFlag,
    noGit: noGitFlag,
    yes: yesFlag,
    trust: trustFlag,
    dryRun: dryRunFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const createRequests = yield* CreateRequestService;
      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;

      const normalized = yield* createRequests.normalize({
        name: flags.name,
        from: flags.from,
        targets: flags.target,
        root: flags.root,
        runtime: flags.runtime,
        packageManager: flags.packageManager,
        monorepo: flags.monorepo,
        lint: flags.lint,
        format: flags.format,
        test: flags.test,
        noGit: flags.noGit,
      });

      const existing = yield* configure
        .readConfig(normalized.repoRoot)
        .pipe(Effect.option);

      if (Option.isSome(existing)) {
        return yield* Effect.fail(
          `${CONFIG_FILENAME} already exists at ${configure.configPath(
            normalized.repoRoot,
          )}. This looks like an existing stack-effect project; use 'stack-effect init' and 'stack-effect add' for existing or incremental workflows.`,
        );
      }

      yield* Console.log(`Create command: ${normalized.command}`);

      if (!flags.dryRun) {
        yield* configure.writeConfig(normalized.repoRoot, normalized.config);
        yield* Console.log(`\nWritten ${CONFIG_FILENAME}`);
      }

      yield* pipeline.run({
        selection: normalized.selection,
        repoRoot: normalized.repoRoot,
        yes: flags.yes,
        dryRun: flags.dryRun,
        trust: flags.trust || flags.yes,
        config: normalized.config,
      });
    }),
).pipe(
  Command.withDescription(
    "Create a greenfield stack-effect project from compact target specs or create input JSON.",
  ),
  Command.withShortDescription("Create a full project in one command"),
  Command.withExamples([
    {
      command:
        "stack-effect create chat-app --target client-react/web:client-react-chat",
      description:
        "Create a full-stack chat app, expanding default targets and required dependencies",
    },
    {
      command:
        "stack-effect create chat-app --target client-react/web:client-react-chat --target package/ai:package-ai-chat-service,package-ai-toolkit-math --dry-run",
      description: "Preview a create command without writing files",
    },
    {
      command: "stack-effect create --from create.json",
      description: "Create from simple JSON input",
    },
    {
      command: "stack-effect create --from - --dry-run",
      description: "Preview create input read from stdin",
    },
  ]),
);
