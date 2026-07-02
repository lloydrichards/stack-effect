/**
 * CLI Acceptance Test Harness
 *
 * A BDD-style DSL for testing the stack-effect CLI end-to-end.
 * Uses a "test container" pattern where each scenario gets an isolated
 * workspace that is automatically cleaned up via Effect scoping.
 *
 * @example
 * ```typescript
 * it.effect("init creates a buildable project", () =>
 *   Effect.gen(function* () {
 *     const cli = yield* CLI
 *
 *     yield* cli.run("init", "my-app", "--yes")
 *     yield* cli.expectExitCode(0)
 *
 *     yield* cli.withinProject("my-app", function* (project) {
 *       yield* project.install()
 *       yield* project.expectBuildSucceeds()
 *       yield* project.expectLintPasses()
 *     })
 *   }).pipe(Effect.provide(CLI.Live))
 * )
 * ```
 */

import { NodeServices } from "@effect/platform-node";
import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Path,
  Scope,
  Stream,
} from "effect";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

// ---------------------------------------------------------------------------
// Helpers – process spawning via Effect ChildProcess
// ---------------------------------------------------------------------------

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Spawn a command capturing stdout, stderr, and exit code.
 * Requires ChildProcessSpawner in context.
 */
const spawnCommand = (
  spawner: ChildProcessSpawner["Service"],
  args: ReadonlyArray<string>,
  cwd: string,
) => {
  const command = ChildProcess.make(args.join(" "), [], { cwd, shell: true });

  return Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const [stdout, stderr, exitCode] = yield* Effect.all([
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ]);
      return { exitCode: exitCode, stdout, stderr };
    }),
  ).pipe(Effect.orDie);
};

// ---------------------------------------------------------------------------
// WorkspaceContainer – isolated temp directory with lifecycle
// ---------------------------------------------------------------------------

export class WorkspaceContainer extends Context.Service<WorkspaceContainer>()(
  "e2e/WorkspaceContainer",
  {
    make: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const scope = yield* Scope.Scope;
      const dir = yield* fs.makeTempDirectory({
        prefix: "stack-effect-e2e-",
      });
      yield* Scope.addFinalizer(
        scope,
        fs.remove(dir, { recursive: true }).pipe(
          Effect.tap(() => Effect.log(`Cleaned workspace: ${dir}`)),
          Effect.orDie,
        ),
      );
      yield* Effect.log(`Created workspace: ${dir}`);
      return { dir };
    }).pipe(Effect.orDie),
  },
) {
  static readonly layer = Layer.effect(
    WorkspaceContainer,
    WorkspaceContainer.make,
  ).pipe(Layer.provide(NodeServices.layer));
}

// ---------------------------------------------------------------------------
// ProjectContext – assertions within a generated project
// ---------------------------------------------------------------------------

export interface ProjectContext {
  readonly dir: string;
  readonly install: () => Effect.Effect<CommandResult>;
  readonly exec: (
    ...args: ReadonlyArray<string>
  ) => Effect.Effect<CommandResult>;
  readonly expectBuildSucceeds: () => Effect.Effect<void>;
  readonly expectLintPasses: () => Effect.Effect<void>;
  readonly expectFormatPasses: () => Effect.Effect<void>;
  readonly expectTypeCheckPasses: () => Effect.Effect<void>;
  readonly expectTestsPasses: () => Effect.Effect<void>;
  readonly expectFileExists: (relativePath: string) => Effect.Effect<void>;
  readonly expectFileNotExists: (relativePath: string) => Effect.Effect<void>;
  readonly expectFileContaining: (
    relativePath: string,
    pattern: string | RegExp,
  ) => Effect.Effect<void>;
  readonly expectDirectoryContains: (
    relativePath: string,
    entries: ReadonlyArray<string>,
  ) => Effect.Effect<void>;
}

const makeProjectContext = (
  projectDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  spawner: ChildProcessSpawner["Service"],
): ProjectContext => {
  const run = (args: ReadonlyArray<string>) =>
    spawnCommand(spawner, args, projectDir);

  const assertCommand = (label: string, ...args: ReadonlyArray<string>) =>
    run(args).pipe(
      Effect.flatMap((r) =>
        r.exitCode === 0
          ? Effect.void
          : Effect.die(
              new Error(
                `${label} failed (exit ${r.exitCode})\nstdout: ${r.stdout.slice(0, 500)}\nstderr: ${r.stderr.slice(0, 500)}`,
              ),
            ),
      ),
    );

  return {
    dir: projectDir,
    install: () => run(["bun", "install"]),
    exec: (...args) => run(args),
    expectBuildSucceeds: () => assertCommand("Build", "bun", "run", "build"),
    expectLintPasses: () => assertCommand("Lint", "bun", "lint"),
    expectFormatPasses: () => assertCommand("Format", "bun", "format:check"),
    expectTypeCheckPasses: () =>
      assertCommand("TypeCheck", "bun", "run", "type-check"),
    expectTestsPasses: () => assertCommand("Tests", "bun", "run", "test"),

    expectFileExists: (relativePath) =>
      fs.exists(path.join(projectDir, relativePath)).pipe(
        Effect.flatMap((exists) =>
          exists
            ? Effect.void
            : Effect.die(new Error(`Expected file to exist: ${relativePath}`)),
        ),
        Effect.orDie,
      ),

    expectFileNotExists: (relativePath) =>
      fs.exists(path.join(projectDir, relativePath)).pipe(
        Effect.flatMap((exists) =>
          exists
            ? Effect.die(
                new Error(`Expected file NOT to exist: ${relativePath}`),
              )
            : Effect.void,
        ),
        Effect.orDie,
      ),

    expectFileContaining: (relativePath, pattern) =>
      fs.readFileString(path.join(projectDir, relativePath)).pipe(
        Effect.flatMap((content) => {
          const matches =
            typeof pattern === "string"
              ? content.includes(pattern)
              : pattern.test(content);
          return matches
            ? Effect.void
            : Effect.die(
                new Error(
                  `File ${relativePath} does not match pattern: ${pattern}`,
                ),
              );
        }),
        Effect.orDie,
      ),

    expectDirectoryContains: (relativePath, entries) =>
      fs.readDirectory(path.join(projectDir, relativePath)).pipe(
        Effect.flatMap((dirEntries) => {
          for (const entry of entries) {
            if (!dirEntries.includes(entry)) {
              return Effect.die(
                new Error(
                  `Directory ${relativePath} missing entry: ${entry}. Found: ${dirEntries.join(", ")}`,
                ),
              );
            }
          }
          return Effect.void;
        }),
        Effect.orDie,
      ),
  };
};

// ---------------------------------------------------------------------------
// CLI Service – the primary DSL interface
// ---------------------------------------------------------------------------

const cliEntrypoint = new URL("../src/index.ts", import.meta.url).pathname;

export class CLI extends Context.Service<CLI>()("e2e/CLI", {
  make: Effect.gen(function* () {
    const container = yield* WorkspaceContainer;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner;
    const workdir = container.dir;

    const run = (args: ReadonlyArray<string>) =>
      spawnCommand(spawner, args, workdir);

    let lastResult: CommandResult = { exitCode: -1, stdout: "", stderr: "" };

    return {
      workdir,

      run: (...args: ReadonlyArray<string>) =>
        run(["bun", "run", cliEntrypoint, ...args]).pipe(
          Effect.tap((r) =>
            Effect.sync(() => {
              lastResult = r;
            }),
          ),
        ),

      expectExitCode: (code: number) =>
        Effect.suspend(() =>
          lastResult.exitCode === code
            ? Effect.void
            : Effect.die(
                new Error(
                  `Expected exit code ${code}, got ${lastResult.exitCode}\nstdout: ${lastResult.stdout.slice(0, 1000)}\nstderr: ${lastResult.stderr.slice(0, 1000)}`,
                ),
              ),
        ),

      expectOutputContaining: (text: string) =>
        Effect.suspend(() =>
          lastResult.stdout.includes(text)
            ? Effect.void
            : Effect.die(
                new Error(
                  `Expected output to contain "${text}"\nGot: ${lastResult.stdout.slice(0, 1000)}`,
                ),
              ),
        ),

      expectErrorContaining: (text: string) =>
        Effect.suspend(() =>
          lastResult.stderr.includes(text)
            ? Effect.void
            : Effect.die(
                new Error(
                  `Expected stderr to contain "${text}"\nGot: ${lastResult.stderr.slice(0, 1000)}`,
                ),
              ),
        ),

      expectFileExists: (relativePath: string) =>
        fs.exists(path.join(workdir, relativePath)).pipe(
          Effect.flatMap((exists) =>
            exists
              ? Effect.void
              : Effect.die(
                  new Error(`Expected file to exist: ${relativePath}`),
                ),
          ),
          Effect.orDie,
        ),

      expectFileNotExists: (relativePath: string) =>
        fs.exists(path.join(workdir, relativePath)).pipe(
          Effect.flatMap((exists) =>
            exists
              ? Effect.die(
                  new Error(`Expected file NOT to exist: ${relativePath}`),
                )
              : Effect.void,
          ),
          Effect.orDie,
        ),

      expectFileContaining: (relativePath: string, pattern: string | RegExp) =>
        fs.readFileString(path.join(workdir, relativePath)).pipe(
          Effect.flatMap((content) => {
            const matches =
              typeof pattern === "string"
                ? content.includes(pattern)
                : pattern.test(content);
            return matches
              ? Effect.void
              : Effect.die(
                  new Error(`File ${relativePath} does not match: ${pattern}`),
                );
          }),
          Effect.orDie,
        ),

      expectJsonFile: (
        relativePath: string,
        keyPath: string,
        value?: unknown,
      ) =>
        fs.readFileString(path.join(workdir, relativePath)).pipe(
          Effect.flatMap((content) => {
            const json = JSON.parse(content);
            const keys = keyPath.split(".");
            let current: unknown = json;
            for (const key of keys) {
              if (current == null || typeof current !== "object") {
                return Effect.die(
                  new Error(
                    `Key path "${keyPath}" not found in ${relativePath}`,
                  ),
                );
              }
              current = (current as Record<string, unknown>)[key];
            }
            if (current === undefined) {
              return Effect.die(
                new Error(`Key path "${keyPath}" not found in ${relativePath}`),
              );
            }
            if (value !== undefined && current !== value) {
              return Effect.die(
                new Error(
                  `Expected ${relativePath}[${keyPath}] = ${JSON.stringify(value)}, got ${JSON.stringify(current)}`,
                ),
              );
            }
            return Effect.void;
          }),
          Effect.orDie,
        ),

      withinProject: (
        projectName: string,
        fn: (
          project: ProjectContext,
        ) => Generator<Effect.Effect<any>, void, any>,
      ) => {
        const projectDir = path.join(workdir, projectName);
        const project = makeProjectContext(projectDir, fs, path, spawner);
        return Effect.gen(() => fn(project));
      },
    };
  }),
}) {
  /**
   * Full test layer – provides CLI with workspace container lifecycle.
   * Each test gets a fresh temp directory that is cleaned up on completion.
   */
  static readonly layer = Layer.effect(CLI, CLI.make).pipe(
    Layer.provide(WorkspaceContainer.layer),
    Layer.provide(NodeServices.layer),
  );
}
