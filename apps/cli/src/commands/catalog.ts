import * as nodeFs from "node:fs/promises";
import { CatalogService } from "@repo/catalog";
import { Apply } from "@repo/domain/Apply";
import {
  Contribution,
  ModuleCategory,
  ModuleId,
  SupportedOn,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import {
  ApplyService,
  BlueprintService,
  ContributionResolver,
  FinalizeService,
  PlanService,
} from "@repo/scaffold";
import {
  Array as Arr,
  Console,
  Data,
  DateTime,
  Effect,
  FileSystem,
  Option,
  Path,
  pipe,
  Result,
  Schema,
  Stream,
} from "effect";
import { Command } from "effect/unstable/cli";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { rootFlag } from "../flags";

const defaultWorkspaceRoot = "workspace/catalog-built";

const defaultTargetNames = new Map<string, string>([
  ["server", "api"],
  ["client-react", "web"],
  ["client-foldkit", "app"],
  ["cli", "app"],
  ["package", "domain"],
]);

const ManifestContribution = Schema.Struct({
  origin: Schema.Literals(["target", "module"]),
  targetKey: Schema.String,
  moduleId: Schema.optional(Schema.String),
  contributionTag: Schema.String,
});

const ManifestFile = Schema.Struct({
  path: Schema.String,
  contributors: Schema.Array(ManifestContribution),
});

const CatalogWorkspaceManifest = Schema.Struct({
  generatedAt: Schema.String,
  command: Schema.String,
  files: Schema.Array(ManifestFile),
});

type ManifestContributor = typeof ManifestContribution.Type;

class WorkspaceCommandFailed extends Data.TaggedError(
  "WorkspaceCommandFailed",
)<{
  command: string;
  cause: unknown;
}> {}

class WorkspaceValidationFailed extends Data.TaggedError(
  "WorkspaceValidationFailed",
)<{
  command: string;
  exitCode: number;
}> {}

const targetIdentityFrom = (supportedOn: typeof SupportedOn.Type) =>
  supportedOn._tag === "identity"
    ? supportedOn.identity
    : new TargetIdentity({
        kind: supportedOn.kind,
        name: defaultTargetNames.get(supportedOn.kind) ?? supportedOn.kind,
      });

const contributionPath = (contribution: typeof Contribution.Type): string =>
  contribution._tag === "barrel-export"
    ? contribution.barrelPath
    : contribution.path;

const buildWorkspaceSelection = Effect.fn("catalog.workspace.buildSelection")(
  function* () {
    const catalog = yield* CatalogService;
    const targets = new Map<
      string,
      {
        identity: TargetIdentity;
        modules: Set<typeof ModuleId.Type>;
      }
    >();

    const ensureTarget = (identity: TargetIdentity) => {
      const key = identity.toKey();
      const current = targets.get(key);
      if (current) return current;
      const next = {
        identity,
        modules: new Set<typeof ModuleId.Type>(),
      };
      targets.set(key, next);
      return next;
    };

    for (const targetKind of catalog.getTargetKinds()) {
      ensureTarget(
        new TargetIdentity({
          kind: targetKind,
          name:
            targetKind === "workspace"
              ? "catalog-built"
              : (defaultTargetNames.get(targetKind) ?? targetKind),
        }),
      );
    }

    const initDefaultModules = [
      ModuleCategory.make("monorepo"),
      ModuleCategory.make("lint"),
      ModuleCategory.make("format"),
      ModuleCategory.make("test"),
    ].flatMap((category) =>
      pipe(
        catalog.getModules({ category }),
        Arr.head,
        Option.match({
          onNone: () => [],
          onSome: (moduleDefinition) => [moduleDefinition.id],
        }),
      ),
    );

    const initTarget = ensureTarget(
      new TargetIdentity({
        kind: TargetKind.make("workspace"),
        name: "catalog-built",
      }),
    );
    for (const moduleId of initDefaultModules) {
      initTarget.modules.add(moduleId);
    }

    for (const moduleDefinition of catalog.getModules()) {
      for (const supportedOn of moduleDefinition.supportedOn) {
        if (supportedOn._tag === "kind" && supportedOn.kind === "workspace") {
          continue;
        }
        ensureTarget(targetIdentityFrom(supportedOn)).modules.add(
          moduleDefinition.id,
        );
      }
    }

    const selectedTargets = Array.from(targets.values())
      .map((target) => ({
        identity: target.identity,
        modules: Array.from(target.modules)
          .sort((a, b) => a.localeCompare(b))
          .map((id) => ({ id })),
      }))
      .sort((a, b) => a.identity.toKey().localeCompare(b.identity.toKey()));

    return { targets: selectedTargets } satisfies typeof Selection.Type;
  },
);

const buildManifest = Effect.fn("catalog.workspace.buildManifest")(function* ({
  blueprint,
  config,
}: {
  blueprint: typeof import("@repo/domain/Blueprint").Blueprint.Type;
  config: typeof StackConfig.Type;
}) {
  const resolver = yield* ContributionResolver;
  const normalized = yield* resolver.resolve(blueprint, config);
  const contributorsByPath = new Map<string, Array<ManifestContributor>>();

  const appendContributor = (
    path: string,
    contributor: ManifestContributor,
  ) => {
    contributorsByPath.set(path, [
      ...(contributorsByPath.get(path) ?? []),
      contributor,
    ]);
  };

  for (const target of normalized.targets) {
    for (const contribution of target.contributions) {
      appendContributor(contributionPath(contribution), {
        origin: "target",
        targetKey: target.targetKey,
        contributionTag: contribution._tag,
      });
    }
  }

  for (const module of normalized.modules) {
    for (const contribution of module.contributions) {
      appendContributor(contributionPath(contribution), {
        origin: "module",
        targetKey: module.targetKey,
        moduleId: module.moduleId,
        contributionTag: contribution._tag,
      });
    }
  }

  const manifestFiles: Array<typeof ManifestFile.Type> = Array.from(
    contributorsByPath.entries(),
  )
    .map(([path, contributors]) =>
      ManifestFile.make({
        path,
        contributors,
      }),
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  const now = yield* DateTime.now;

  return CatalogWorkspaceManifest.make({
    generatedAt: DateTime.formatIso(now),
    command: "stack-effect catalog workspace reset",
    files: manifestFiles,
  });
});

const annotationFor = (
  file: typeof ManifestFile.Type,
): Option.Option<string> => {
  const sourceLines = pipe(
    file.contributors,
    Arr.map((contributor) =>
      contributor.origin === "module"
        ? `${contributor.targetKey}#${contributor.moduleId}:${contributor.contributionTag}`
        : `${contributor.targetKey}:${contributor.contributionTag}`,
    ),
  );

  const body = [
    "Generated from stack-effect catalog. Edit this workspace, then use git diff to port changes back.",
    `Catalog contributors: ${sourceLines.join(", ")}`,
  ];

  if (
    file.path.endsWith(".ts") ||
    file.path.endsWith(".tsx") ||
    file.path.endsWith(".js") ||
    file.path.endsWith(".jsx")
  ) {
    return Option.some(`${body.map((line) => `// ${line}`).join("\n")}\n\n`);
  }

  if (file.path.endsWith(".css")) {
    return Option.some(
      `/*\n${body.map((line) => ` * ${line}`).join("\n")}\n */\n\n`,
    );
  }

  if (file.path.endsWith(".html")) {
    return Option.some(
      `<!--\n${body.map((line) => `  ${line}`).join("\n")}\n-->\n`,
    );
  }

  return Option.none();
};

const annotateWorkspace = Effect.fn("catalog.workspace.annotate")(function* ({
  repoRoot,
  manifest,
}: {
  repoRoot: string;
  manifest: typeof CatalogWorkspaceManifest.Type;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* Effect.forEach(
    manifest.files,
    (file) =>
      Effect.gen(function* () {
        const annotation = annotationFor(file);
        if (Option.isNone(annotation)) return;

        const filePath = path.join(repoRoot, file.path);
        const contents = yield* fs.readFileString(filePath).pipe(Effect.option);
        if (
          Option.isNone(contents) ||
          contents.value.startsWith(annotation.value)
        ) {
          return;
        }

        yield* fs.writeFileString(
          filePath,
          `${annotation.value}${contents.value}`,
        );
      }),
    { concurrency: 1 },
  );
});

const runGit = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const command = ChildProcess.make("git", [...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = yield* spawner.exitCode(command).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceCommandFailed({
            command: `git ${args.join(" ")}`,
            cause,
          }),
      ),
    );
    if (exitCode !== 0) {
      return yield* new WorkspaceCommandFailed({
        command: `git ${args.join(" ")}`,
        cause: `Process exited with code ${exitCode}`,
      });
    }
  });

const gitOutput = Effect.fn("gitOutput")(function* (
  cwd: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner;
  const command = ChildProcess.make("git", [...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return yield* spawner.string(command, { includeStderr: true }).pipe(
    Effect.mapError(
      (cause) =>
        new WorkspaceCommandFailed({
          command: `git ${args.join(" ")}`,
          cause,
        }),
    ),
  );
});

const runCommandCapture = (
  cwd: string,
  commandName: string,
  args: ReadonlyArray<string>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const command = ChildProcess.make(commandName, [...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      const handle = yield* spawner.spawn(command).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceCommandFailed({
              command: `${commandName} ${args.join(" ")}`,
              cause,
            }),
        ),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all([
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ]).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceCommandFailed({
              command: `${commandName} ${args.join(" ")}`,
              cause,
            }),
        ),
      );

      return { exitCode, stdout, stderr };
    }),
  );

const linkWorkspacePackages = Effect.fn("catalog.workspace.linkPackages")(
  function* (repoRoot: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const packagesRoot = path.join(repoRoot, "packages");
    const packageNames = yield* fs
      .readDirectory(packagesRoot)
      .pipe(Effect.catch(() => Effect.succeed([] as Array<string>)));
    const scopeRoot = path.join(repoRoot, "node_modules", "@repo");

    yield* fs.makeDirectory(scopeRoot, { recursive: true });
    yield* Effect.forEach(
      packageNames,
      (packageName) =>
        Effect.tryPromise({
          try: () =>
            nodeFs.symlink(
              path.join(packagesRoot, packageName),
              path.join(scopeRoot, packageName),
              "dir",
            ),
          catch: (error) =>
            new WorkspaceCommandFailed({
              command: `link @repo/${packageName}`,
              cause: error,
            }),
        }),
      { concurrency: 1 },
    );
  },
);

const runFinalizeScripts = Effect.fn("catalog.workspace.runFinalizeScripts")(
  function* ({
    blueprint,
    config,
    repoRoot,
  }: {
    blueprint: typeof import("@repo/domain/Blueprint").Blueprint.Type;
    config: typeof StackConfig.Type;
    repoRoot: string;
  }) {
    const finalizeService = yield* FinalizeService;
    const executables = yield* finalizeService.run(blueprint, {
      config,
      repoRoot,
    });

    yield* Effect.forEach(
      executables,
      ({ execute, script }) =>
        Effect.scoped(
          Effect.gen(function* () {
            yield* Console.log(`$ ${script.command}`);
            const { output, result } = yield* execute();
            yield* Stream.runForEach(output, Console.log);
            const scriptResult = yield* result;

            return yield* Result.match(scriptResult, {
              onSuccess: () => Effect.void,
              onFailure: ({ error }) =>
                new WorkspaceCommandFailed({
                  command: script.command,
                  cause: error,
                }),
            });
          }),
        ),
      { concurrency: 1 },
    );
  },
);

const reset = Command.make("reset", { root: rootFlag }, (flags) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const repoRoot = path.resolve(
      Option.getOrElse(flags.root, () => defaultWorkspaceRoot),
    );

    yield* fs
      .remove(repoRoot, { recursive: true })
      .pipe(
        Effect.catch((error) =>
          error.reason._tag === "NotFound" ? Effect.void : Effect.fail(error),
        ),
      );
    yield* fs.makeDirectory(repoRoot, { recursive: true });

    const config = new StackConfig({
      name: "catalog-built" as typeof Schema.NonEmptyString.Type,
      runtime: { _tag: "bun" },
      lint: "biome",
      format: "biome",
      test: "vitest",
      monorepo: "turbo",
    });

    const selection = yield* buildWorkspaceSelection();
    const blueprintService = yield* BlueprintService;
    const blueprint = yield* blueprintService.resolve(selection);
    const planService = yield* PlanService;
    const plan = yield* planService.build({ blueprint, repoRoot, config });
    const applyService = yield* ApplyService;
    const result = yield* applyService.apply({
      apply: new Apply({ plan, decisions: [] }),
      repoRoot,
    });

    const manifest = yield* buildManifest({ blueprint, config });
    yield* annotateWorkspace({ repoRoot, manifest });
    yield* fs.writeFileString(
      path.join(repoRoot, ".catalog-build-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    yield* runFinalizeScripts({ blueprint, config, repoRoot });

    yield* runGit(repoRoot, ["init", "--initial-branch=main"]);
    yield* runGit(repoRoot, ["add", "."]);
    yield* runGit(repoRoot, [
      "-c",
      "user.name=stack-effect",
      "-c",
      "user.email=stack-effect@example.invalid",
      "commit",
      "-m",
      "catalog workspace baseline",
    ]);
    yield* linkWorkspacePackages(repoRoot);

    yield* Console.log(`Catalog workspace reset at ${repoRoot}`);
    yield* Console.log(`Created: ${result.created.length}`);
    yield* Console.log(`Modified: ${result.modified.length}`);
    if (result.failed.length > 0) {
      yield* Console.log(`Failed: ${result.failed.length}`);
    }
  }),
).pipe(
  Command.withDescription(
    "Reset an editable generated catalog workspace and commit a git baseline.",
  ),
);

const diff = Command.make("diff", { root: rootFlag }, (flags) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const repoRoot = path.resolve(
      Option.getOrElse(flags.root, () => defaultWorkspaceRoot),
    );
    const output = yield* gitOutput(repoRoot, ["diff"]);
    yield* Console.log(output.trimEnd());
  }),
).pipe(
  Command.withDescription(
    "Print git diff for the generated catalog workspace.",
  ),
);

const validate = Command.make("validate", { root: rootFlag }, (flags) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const repoRoot = path.resolve(
      Option.getOrElse(flags.root, () => defaultWorkspaceRoot),
    );
    const { exitCode, stdout, stderr } = yield* runCommandCapture(
      repoRoot,
      "bun",
      ["run", "type-check"],
    );
    if (stdout.trim().length > 0) yield* Console.log(stdout.trimEnd());
    if (stderr.trim().length > 0) yield* Console.log(stderr.trimEnd());
    if (exitCode !== 0) {
      return yield* new WorkspaceValidationFailed({
        command: "bun run type-check",
        exitCode,
      });
    }
  }),
).pipe(
  Command.withDescription(
    "Run the generated catalog workspace type-check command.",
  ),
);

const workspace = Command.make("workspace").pipe(
  Command.withSubcommands([reset, diff, validate]),
  Command.withDescription(
    "Create and inspect an editable generated catalog workspace.",
  ),
);

export const catalog = Command.make("catalog").pipe(
  Command.withSubcommands([workspace]),
  Command.withDescription("Catalog maintenance helper commands."),
);
