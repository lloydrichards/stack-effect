import { createHash, randomUUID } from "node:crypto";
import * as NodeFs from "node:fs/promises";
import process from "node:process";
import type { StackConfig } from "@repo/domain/Scaffold";
import { Context, Data, Effect, Exit, Layer } from "effect";
import { ConfigureService } from "./ConfigureService";

export class WorkspaceTransactionFailure extends Data.TaggedError(
  "WorkspaceTransactionFailure",
)<{
  readonly phase:
    | "lock"
    | "stage"
    | "execute"
    | "validate"
    | "config"
    | "drift"
    | "promote"
    | "cleanup";
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WorkspaceFileOperationFailure extends Data.TaggedError(
  "WorkspaceFileOperationFailure",
)<{ readonly cause: unknown }> {}

type Stat = Awaited<ReturnType<typeof NodeFs.lstat>>;
type FileEffect<A> = Effect.Effect<A, WorkspaceFileOperationFailure>;

export interface WorkspaceFileOperationsShape {
  readonly lstat: (path: string) => FileEffect<Stat>;
  readonly readDirectory: (path: string) => FileEffect<ReadonlyArray<string>>;
  readonly readFile: (path: string) => FileEffect<Uint8Array>;
  readonly readLink: (path: string) => FileEffect<string>;
  readonly copy: (from: string, to: string) => FileEffect<void>;
  readonly makeDirectory: (path: string) => FileEffect<void>;
  readonly remove: (path: string) => FileEffect<void>;
  readonly rename: (from: string, to: string) => FileEffect<void>;
  readonly acquireLock: (path: string) => FileEffect<void>;
  readonly cwd: Effect.Effect<string>;
  readonly chdir: (path: string) => FileEffect<void>;
}

const attempt = <A>(evaluate: () => Promise<A>): FileEffect<A> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new WorkspaceFileOperationFailure({ cause }),
  });

export class WorkspaceFileOperations extends Context.Service<
  WorkspaceFileOperations,
  WorkspaceFileOperationsShape
>()("WorkspaceFileOperations", {
  make: Effect.sync(
    (): WorkspaceFileOperationsShape => ({
      lstat: (path) => attempt(() => NodeFs.lstat(path)),
      readDirectory: (path) => attempt(() => NodeFs.readdir(path)),
      readFile: (path) => attempt(() => NodeFs.readFile(path)),
      readLink: (path) => attempt(() => NodeFs.readlink(path)),
      copy: (from, to) =>
        attempt(() =>
          NodeFs.cp(from, to, {
            recursive: true,
            dereference: false,
            preserveTimestamps: true,
            verbatimSymlinks: true,
          }),
        ),
      makeDirectory: (path) =>
        attempt(() =>
          NodeFs.mkdir(path, { recursive: true }).then(() => undefined),
        ),
      remove: (path) =>
        attempt(() => NodeFs.rm(path, { recursive: true, force: true })),
      rename: (from, to) => attempt(() => NodeFs.rename(from, to)),
      acquireLock: (path) =>
        attempt(() => NodeFs.open(path, "wx").then((handle) => handle.close())),
      cwd: Effect.sync(() => process.cwd()),
      chdir: (path) =>
        Effect.try({
          try: () => process.chdir(path),
          catch: (cause) => new WorkspaceFileOperationFailure({ cause }),
        }),
    }),
  ),
}) {
  static readonly layer = Layer.effect(
    WorkspaceFileOperations,
    WorkspaceFileOperations.make,
  );
}

const failure = (
  phase: WorkspaceTransactionFailure["phase"],
  message: string,
  cause?: unknown,
) => new WorkspaceTransactionFailure({ phase, message, cause });

const missing = (error: WorkspaceFileOperationFailure): boolean => {
  const cause = error.cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ENOENT"
  );
};

const exists = (operations: WorkspaceFileOperationsShape, path: string) =>
  operations.lstat(path).pipe(
    Effect.as(true),
    Effect.catch((error) =>
      missing(error) ? Effect.succeed(false) : Effect.fail(error),
    ),
  );

const fingerprint = (operations: WorkspaceFileOperationsShape, root: string) =>
  Effect.gen(function* () {
    if (!(yield* exists(operations, root))) return "absent";
    const hash = createHash("sha256");
    const visit = (absolute: string, relative: string): FileEffect<void> =>
      Effect.gen(function* () {
        const stat = yield* operations.lstat(absolute);
        const kind = stat.isSymbolicLink()
          ? "link"
          : stat.isDirectory()
            ? "directory"
            : "file";
        hash.update(
          `${relative}\0${kind}\0${stat.mode}\0${stat.size}\0${stat.mtimeMs}\0`,
        );
        if (kind === "link") hash.update(yield* operations.readLink(absolute));
        else if (kind === "file")
          hash.update(yield* operations.readFile(absolute));
        else {
          const children = [
            ...(yield* operations.readDirectory(absolute)),
          ].sort();
          yield* Effect.forEach(
            children,
            (child) =>
              visit(
                `${absolute}/${child}`,
                relative ? `${relative}/${child}` : child,
              ),
            { concurrency: 1, discard: true },
          );
        }
      });
    yield* visit(root, "");
    return hash.digest("hex");
  });

const insideRoot = (cwd: string, root: string) =>
  cwd === root || cwd.startsWith(`${root}/`);

const causeOf = <E>(exit: Exit.Exit<unknown, E>) =>
  Exit.isFailure(exit) ? exit.cause : undefined;

export class WorkspaceTransaction extends Context.Service<WorkspaceTransaction>()(
  "WorkspaceTransaction",
  {
    make: Effect.gen(function* () {
      const operations = yield* WorkspaceFileOperations;
      const configure = yield* ConfigureService;

      const run = <E, R, E2, R2>({
        root,
        config,
        execute,
        validate,
        persistConfig = true,
      }: {
        readonly root: string;
        readonly config: typeof StackConfig.Type;
        readonly persistConfig?: boolean;
        readonly execute: (stageRoot: string) => Effect.Effect<unknown, E, R>;
        readonly validate: (
          stageRoot: string,
        ) => Effect.Effect<unknown, E2, R2>;
      }): Effect.Effect<void, WorkspaceTransactionFailure, R | R2> =>
        Effect.gen(function* () {
          const slash = root.lastIndexOf("/");
          const parent = slash <= 0 ? "/" : root.slice(0, slash);
          const name = root.slice(slash + 1);
          const suffix = randomUUID();
          const lock = `${parent}/.${name}.stack-effect.lock`;
          const stage = `${parent}/${name}-stack-effect-stage-${suffix}`;
          const backup = `${parent}/.${name}.stack-effect-backup-${suffix}`;

          yield* operations
            .makeDirectory(parent)
            .pipe(
              Effect.mapError((cause) =>
                failure(
                  "lock",
                  `Cannot prepare lock parent for ${root}`,
                  cause,
                ),
              ),
            );
          yield* operations
            .acquireLock(lock)
            .pipe(
              Effect.mapError((cause) =>
                failure(
                  "lock",
                  `Workspace transaction already active for ${root}`,
                  cause,
                ),
              ),
            );

          let stagePresent = false;
          let backupPresent = false;
          let syntheticGitBoundary = false;
          let relativeCwd: string | undefined;
          const body = Effect.gen(function* () {
            const rootExists = yield* exists(operations, root).pipe(
              Effect.mapError((cause) =>
                failure("stage", `Cannot inspect ${root}`, cause),
              ),
            );
            const original = yield* fingerprint(operations, root).pipe(
              Effect.mapError((cause) =>
                failure("stage", `Cannot fingerprint ${root}`, cause),
              ),
            );
            yield* (
              rootExists
                ? operations.copy(root, stage)
                : operations.makeDirectory(stage)
            ).pipe(
              Effect.mapError((cause) =>
                failure("stage", `Cannot stage ${root}`, cause),
              ),
            );
            stagePresent = true;

            const stageGit = `${stage}/.git`;
            const stageGitExists = yield* exists(operations, stageGit).pipe(
              Effect.mapError((cause) =>
                failure(
                  "stage",
                  `Cannot inspect staged workspace boundary ${stageGit}`,
                  cause,
                ),
              ),
            );
            if (!stageGitExists) {
              yield* operations
                .makeDirectory(stageGit)
                .pipe(
                  Effect.mapError((cause) =>
                    failure(
                      "stage",
                      `Cannot isolate staged workspace ${stage}`,
                      cause,
                    ),
                  ),
                );
              syntheticGitBoundary = true;
            }

            yield* execute(stage).pipe(
              Effect.mapError((cause) =>
                failure("execute", "Staged scaffold execution failed", cause),
              ),
            );
            if (
              syntheticGitBoundary &&
              (yield* operations
                .readDirectory(stageGit)
                .pipe(
                  Effect.mapError((cause) =>
                    failure(
                      "execute",
                      "Cannot inspect temporary staged workspace boundary",
                      cause,
                    ),
                  ),
                )).length === 0
            ) {
              yield* operations
                .remove(stageGit)
                .pipe(
                  Effect.mapError((cause) =>
                    failure(
                      "execute",
                      "Cannot remove temporary staged workspace boundary",
                      cause,
                    ),
                  ),
                );
              syntheticGitBoundary = false;
            }
            yield* validate(stage).pipe(
              Effect.mapError((cause) =>
                failure(
                  "validate",
                  "Staged workspace validation failed",
                  cause,
                ),
              ),
            );
            if (persistConfig) {
              yield* configure
                .writeConfigAtomic(stage, config)
                .pipe(
                  Effect.mapError((cause) =>
                    failure(
                      "config",
                      "Final manifest write or decode failed",
                      cause,
                    ),
                  ),
                );
            }

            const current = yield* fingerprint(operations, root).pipe(
              Effect.mapError((cause) =>
                failure("drift", `Cannot recheck ${root}`, cause),
              ),
            );
            if (current !== original)
              return yield* failure(
                "drift",
                `Workspace changed concurrently: ${root}`,
              );

            const cwd = yield* operations.cwd;
            relativeCwd = insideRoot(cwd, root)
              ? cwd.slice(root.length)
              : undefined;
            if (relativeCwd !== undefined)
              yield* operations
                .chdir(parent)
                .pipe(
                  Effect.mapError((cause) =>
                    failure(
                      "promote",
                      "Cannot move cwd outside workspace",
                      cause,
                    ),
                  ),
                );

            if (rootExists) {
              yield* operations
                .rename(root, backup)
                .pipe(
                  Effect.mapError((cause) =>
                    failure("promote", "Cannot create workspace backup", cause),
                  ),
                );
              backupPresent = true;
            }

            const promotion = yield* Effect.exit(
              operations.rename(stage, root),
            );
            if (Exit.isFailure(promotion)) {
              if (backupPresent) {
                yield* operations.rename(backup, root).pipe(
                  Effect.mapError((restoreCause) =>
                    failure(
                      "promote",
                      "Promotion failed and backup restoration failed",
                      {
                        promotion: promotion.cause,
                        restoration: restoreCause,
                      },
                    ),
                  ),
                );
                backupPresent = false;
              }
              if (relativeCwd !== undefined)
                yield* operations.chdir(`${root}${relativeCwd}`).pipe(
                  Effect.mapError((restoreCause) =>
                    failure(
                      "promote",
                      "Promotion failed and cwd restoration failed",
                      {
                        promotion: promotion.cause,
                        restoration: restoreCause,
                      },
                    ),
                  ),
                );
              return yield* failure(
                "promote",
                "Cannot promote staged workspace",
                promotion.cause,
              );
            }
            stagePresent = false;

            if (relativeCwd !== undefined)
              yield* operations
                .chdir(`${root}${relativeCwd}`)
                .pipe(
                  Effect.mapError((cause) =>
                    failure(
                      "promote",
                      "Workspace promoted but cwd restoration failed",
                      cause,
                    ),
                  ),
                );
            if (backupPresent) {
              yield* operations
                .remove(backup)
                .pipe(
                  Effect.mapError((cause) =>
                    failure(
                      "cleanup",
                      "Workspace promoted but backup cleanup failed",
                      cause,
                    ),
                  ),
                );
              backupPresent = false;
            }
          });

          const bodyExit = yield* Effect.exit(body);
          const cleanupFailures: Array<unknown> = [];
          if (Exit.isFailure(bodyExit) && relativeCwd !== undefined) {
            const cwdExit = yield* Effect.exit(
              operations.chdir(`${root}${relativeCwd}`),
            );
            if (Exit.isFailure(cwdExit)) cleanupFailures.push(cwdExit.cause);
          }
          if (stagePresent) {
            const stageExit = yield* Effect.exit(operations.remove(stage));
            if (Exit.isFailure(stageExit))
              cleanupFailures.push(stageExit.cause);
          }
          if (backupPresent) {
            const restoreExit = yield* Effect.exit(
              operations.rename(backup, root),
            );
            if (Exit.isFailure(restoreExit))
              cleanupFailures.push(restoreExit.cause);
          }
          const lockExit = yield* Effect.exit(operations.remove(lock));
          if (Exit.isFailure(lockExit)) cleanupFailures.push(lockExit.cause);

          if (cleanupFailures.length > 0)
            return yield* failure(
              "cleanup",
              "Workspace recovery or cleanup failed",
              { body: causeOf(bodyExit), cleanup: cleanupFailures },
            );
          if (Exit.isFailure(bodyExit))
            return yield* Effect.failCause(bodyExit.cause);
        });

      return { run } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(WorkspaceTransaction)(
    WorkspaceTransaction.make,
  );
}
