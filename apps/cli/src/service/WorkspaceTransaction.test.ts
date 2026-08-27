import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import process from "node:process";
import { NodeServices } from "@effect/platform-node";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { StackConfig } from "@repo/domain/Scaffold";
import { Data, Effect, Exit, Layer } from "effect";
import { ConfigureService } from "./ConfigureService";
import {
  WorkspaceFileOperationFailure,
  WorkspaceFileOperations,
  type WorkspaceFileOperationsShape,
  WorkspaceTransaction,
  WorkspaceTransactionFailure,
} from "./WorkspaceTransaction";

const roots: Array<string> = [];
const config = new StackConfig({
  name: "transaction",
  runtime: { _tag: "bun" },
});
class TestIoFailure extends Data.TaggedError("TestIoFailure")<{
  readonly cause: unknown;
}> {}

const io = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new TestIoFailure({ cause }),
  });

const layer = WorkspaceTransaction.layer.pipe(
  Layer.provide(ConfigureService.layer),
  Layer.provide(WorkspaceFileOperations.layer),
  Layer.provide(NodeServices.layer),
);

const temporaryRoot = () =>
  io(async () => {
    const parent = await Fs.mkdtemp(
      Path.join(Os.tmpdir(), "workspace-transaction-"),
    );
    roots.push(parent);
    return Path.join(parent, "workspace");
  });

const siblings = (root: string) =>
  io(() =>
    Fs.readdir(Path.dirname(root)).then((entries) =>
      entries.filter((entry) => entry.startsWith(`.${Path.basename(root)}.`)),
    ),
  );

const rootEntries = (root: string) =>
  io(() => Fs.readdir(root).then((entries) => entries.sort()));

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => Fs.rm(root, { recursive: true, force: true })),
  );
});

describe("WorkspaceTransaction", () => {
  it.effect(
    "uses a unique visible sibling stage for execution and finalization callbacks",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot();
        const transaction = yield* WorkspaceTransaction;
        const stages: Array<string> = [];

        for (let index = 0; index < 2; index += 1) {
          let executeStage = "";
          yield* transaction.run({
            root,
            config,
            execute: (stage) => {
              executeStage = stage;
              stages.push(stage);
              return io(async () => {
                expect(
                  (await Fs.stat(Path.join(stage, ".git"))).isDirectory(),
                ).toBe(true);
                await Fs.writeFile(Path.join(stage, `run-${index}`), root);
              });
            },
            validate: (stage) =>
              Effect.sync(() => {
                expect(stage).toBe(executeStage);
                expect(Path.dirname(stage)).toBe(Path.dirname(root));
                expect(Path.basename(stage).includes(".")).toBe(false);
              }),
          });
        }

        expect(new Set(stages).size).toBe(2);
        expect(yield* siblings(root)).toEqual([]);
        expect(
          yield* io(() =>
            Fs.readdir(Path.dirname(root)).then((entries) => entries.sort()),
          ),
        ).toEqual([Path.basename(root)]);
        expect(
          yield* io(() => Fs.readFile(Path.join(root, "run-1"), "utf8")),
        ).toBe(root);
        expect(
          yield* io(() => Fs.stat(Path.join(root, ".git"))).pipe(Effect.option),
        ).toMatchObject({ _tag: "None" });
      }).pipe(Effect.provide(layer)),
  );

  it.effect(
    "promotes an absent root with the final manifest written last",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot();
        const transaction = yield* WorkspaceTransaction;
        const order: Array<string> = [];
        yield* transaction.run({
          root,
          config,
          execute: (stage) =>
            io(() =>
              Fs.writeFile(Path.join(stage, "created.txt"), "created"),
            ).pipe(Effect.tap(() => Effect.sync(() => order.push("execute")))),
          validate: (stage) =>
            io(() => Fs.readFile(Path.join(stage, "created.txt"), "utf8")).pipe(
              Effect.tap(() => Effect.sync(() => order.push("validate"))),
            ),
        });
        expect(
          yield* io(() => Fs.readFile(Path.join(root, "created.txt"), "utf8")),
        ).toBe("created");
        expect(
          yield* io(() =>
            Fs.readFile(Path.join(root, "stack.effect.json"), "utf8"),
          ),
        ).toContain("transaction");
        expect(order).toEqual(["execute", "validate"]);
        expect(yield* siblings(root)).toEqual([]);
      }).pipe(Effect.provide(layer)),
  );

  it.effect(
    "orders execute, validate, config, then promotion with config as the last staged write",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* temporaryRoot();
          const operations = yield* WorkspaceFileOperations;
          const configure = yield* ConfigureService;
          const events: Array<string> = [];
          const injectedOperations: WorkspaceFileOperationsShape = {
            ...operations,
            rename: (from, to) =>
              Effect.sync(() => events.push("promotion")).pipe(
                Effect.andThen(operations.rename(from, to)),
              ),
          };
          const injectedConfigure: typeof ConfigureService.Service = {
            ...configure,
            writeConfigAtomic: (stage, nextConfig) =>
              Effect.sync(() => events.push("config")).pipe(
                Effect.andThen(configure.writeConfigAtomic(stage, nextConfig)),
              ),
          };
          const injected = WorkspaceTransaction.layer.pipe(
            Layer.provide(Layer.succeed(ConfigureService, injectedConfigure)),
            Layer.provide(
              Layer.succeed(WorkspaceFileOperations, injectedOperations),
            ),
            Layer.provide(NodeServices.layer),
          );
          const transaction = yield* WorkspaceTransaction.pipe(
            Effect.provide(injected),
          );
          yield* transaction.run({
            root,
            config,
            execute: (stage) =>
              io(() => Fs.writeFile(Path.join(stage, "created"), "ok")).pipe(
                Effect.tap(() => Effect.sync(() => events.push("execute"))),
              ),
            validate: () => Effect.sync(() => events.push("validate")),
          });
          expect(events).toEqual([
            "execute",
            "validate",
            "config",
            "promotion",
          ]);
          expect(events.at(-2)).toBe("config");
          expect(yield* rootEntries(root)).toEqual([
            "created",
            "stack.effect.json",
          ]);
          expect(yield* siblings(root)).toEqual([]);
        }).pipe(
          Effect.provide(
            Layer.merge(
              ConfigureService.layer.pipe(Layer.provide(NodeServices.layer)),
              Layer.merge(WorkspaceFileOperations.layer, NodeServices.layer),
            ),
          ),
        ),
      ),
  );

  it.effect(
    "leaves the exact original for config encode, write, and decode failures",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const configure = yield* ConfigureService;
          for (const phase of ["encode", "write", "decode"] as const) {
            const root = yield* temporaryRoot();
            const original = Buffer.from([0, 1, 2, 255]);
            yield* io(async () => {
              await Fs.mkdir(root);
              await Fs.writeFile(Path.join(root, "original.bin"), original);
              await Fs.symlink(
                "original.bin",
                Path.join(root, "original.link"),
              );
            });
            const injectedConfigure: typeof ConfigureService.Service = {
              ...configure,
              writeConfigAtomic: (stage) =>
                io(async () => {
                  if (phase !== "encode")
                    await Fs.writeFile(
                      Path.join(stage, "stack.effect.json.transaction-temp"),
                      phase,
                    );
                  if (phase === "decode")
                    await Fs.rename(
                      Path.join(stage, "stack.effect.json.transaction-temp"),
                      Path.join(stage, "stack.effect.json"),
                    );
                  return undefined;
                }).pipe(
                  Effect.orDie,
                  Effect.andThen(
                    configure.readConfig(`${stage}/missing-${phase}`),
                  ),
                ),
            };
            const injected = WorkspaceTransaction.layer.pipe(
              Layer.provide(Layer.succeed(ConfigureService, injectedConfigure)),
              Layer.provide(WorkspaceFileOperations.layer),
              Layer.provide(NodeServices.layer),
            );
            const transaction = yield* WorkspaceTransaction.pipe(
              Effect.provide(injected),
            );
            const exit = yield* Effect.exit(
              transaction.run({
                root,
                config,
                execute: (stage) =>
                  io(() => Fs.writeFile(Path.join(stage, "partial"), phase)),
                validate: () => Effect.void,
              }),
            );
            expect(Exit.isFailure(exit)).toBe(true);
            expect(
              yield* io(() => Fs.readFile(Path.join(root, "original.bin"))),
            ).toEqual(original);
            expect(
              yield* io(() => Fs.readlink(Path.join(root, "original.link"))),
            ).toBe("original.bin");
            expect(yield* rootEntries(root)).toEqual([
              "original.bin",
              "original.link",
            ]);
            expect(yield* siblings(root)).toEqual([]);
          }
        }).pipe(
          Effect.provide(
            ConfigureService.layer.pipe(Layer.provide(NodeServices.layer)),
          ),
        ),
      ),
  );

  it.effect(
    "preserves ordinary files and symbolic links while applying staged changes",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot();
        yield* io(async () => {
          await Fs.mkdir(root);
          await Fs.writeFile(
            Path.join(root, "dirty.txt"),
            Buffer.from([0, 1, 2, 255]),
          );
          await Fs.symlink("dirty.txt", Path.join(root, "link"));
        });
        const transaction = yield* WorkspaceTransaction;
        yield* transaction.run({
          root,
          config,
          execute: (stage) =>
            io(() => Fs.writeFile(Path.join(stage, "added.txt"), "added")),
          validate: () => Effect.void,
        });
        expect([
          ...(yield* io(() => Fs.readFile(Path.join(root, "dirty.txt")))),
        ]).toEqual([0, 1, 2, 255]);
        expect(yield* io(() => Fs.readlink(Path.join(root, "link")))).toBe(
          "dirty.txt",
        );
        expect(
          yield* io(() => Fs.readFile(Path.join(root, "added.txt"), "utf8")),
        ).toBe("added");
      }).pipe(Effect.provide(layer)),
  );

  it.effect(
    "discards the stage and leaves the exact original when execution fails",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot();
        yield* io(async () => {
          await Fs.mkdir(root);
          await Fs.writeFile(
            Path.join(root, "stack.effect.json"),
            "classic bytes",
          );
        });
        const transaction = yield* WorkspaceTransaction;
        let validated = false;
        const exit = yield* Effect.exit(
          transaction.run({
            root,
            config,
            execute: (stage) =>
              io(() => Fs.writeFile(Path.join(stage, "partial"), "x")).pipe(
                Effect.andThen(Effect.fail("apply failed")),
              ),
            validate: () =>
              Effect.sync(() => {
                validated = true;
              }),
          }),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(validated).toBe(false);
        expect(
          yield* io(() =>
            Fs.readFile(Path.join(root, "stack.effect.json"), "utf8"),
          ),
        ).toBe("classic bytes");
        expect(
          yield* io(() => Fs.stat(Path.join(root, "partial"))).pipe(
            Effect.option,
          ),
        ).toMatchObject({ _tag: "None" });
        expect(yield* siblings(root)).toEqual([]);
      }).pipe(Effect.provide(layer)),
  );

  it.effect(
    "rejects concurrent drift and preserves the concurrent mutation",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot();
        yield* io(() => Fs.mkdir(root));
        const transaction = yield* WorkspaceTransaction;
        const exit = yield* Effect.exit(
          transaction.run({
            root,
            config,
            execute: () =>
              io(() =>
                Fs.writeFile(Path.join(root, "concurrent"), "user change"),
              ),
            validate: () => Effect.void,
          }),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(String(exit.cause)).toContain("WorkspaceTransactionFailure");
        }
        expect(
          yield* io(() => Fs.readFile(Path.join(root, "concurrent"), "utf8")),
        ).toBe("user change");
        expect(yield* siblings(root)).toEqual([]);
      }).pipe(Effect.provide(layer)),
  );

  it.effect("rolls back validation failure without writing config", () =>
    Effect.gen(function* () {
      const root = yield* temporaryRoot();
      yield* io(() => Fs.mkdir(root));
      const transaction = yield* WorkspaceTransaction;
      const exit = yield* Effect.exit(
        transaction.run({
          root,
          config,
          execute: (stage) =>
            io(() => Fs.writeFile(Path.join(stage, "partial"), "x")),
          validate: () => Effect.fail("invalid generated workspace"),
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(yield* io(() => Fs.readdir(root))).toEqual([]);
      expect(yield* siblings(root)).toEqual([]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("restores the backup when the second promotion rename fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* temporaryRoot();
        yield* io(async () => {
          await Fs.mkdir(root);
          await Fs.writeFile(Path.join(root, "original"), "preserved");
        });
        const base = yield* WorkspaceFileOperations;
        let renames = 0;
        const operations: WorkspaceFileOperationsShape = {
          ...base,
          rename: (from, to) => {
            renames += 1;
            return renames === 2
              ? Effect.fail(
                  new WorkspaceFileOperationFailure({ cause: "injected" }),
                )
              : base.rename(from, to);
          },
        };
        const injected = WorkspaceTransaction.layer.pipe(
          Layer.provide(ConfigureService.layer),
          Layer.provide(Layer.succeed(WorkspaceFileOperations, operations)),
          Layer.provide(NodeServices.layer),
        );
        const transaction = yield* WorkspaceTransaction.pipe(
          Effect.provide(injected),
        );
        const exit = yield* Effect.exit(
          transaction.run({
            root,
            config,
            execute: () => Effect.void,
            validate: () => Effect.void,
          }),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(
          yield* io(() => Fs.readFile(Path.join(root, "original"), "utf8")),
        ).toBe("preserved");
        expect(yield* siblings(root)).toEqual([]);
      }).pipe(
        Effect.provide(
          Layer.merge(WorkspaceFileOperations.layer, NodeServices.layer),
        ),
      ),
    ),
  );

  it.effect("surfaces cleanup failure with the original failure cause", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* temporaryRoot();
        yield* io(() => Fs.mkdir(root));
        const base = yield* WorkspaceFileOperations;
        const operations: WorkspaceFileOperationsShape = {
          ...base,
          remove: (path) =>
            path.includes("stage")
              ? Effect.fail(
                  new WorkspaceFileOperationFailure({
                    cause: "injected cleanup",
                  }),
                )
              : base.remove(path),
        };
        const injected = WorkspaceTransaction.layer.pipe(
          Layer.provide(ConfigureService.layer),
          Layer.provide(Layer.succeed(WorkspaceFileOperations, operations)),
          Layer.provide(NodeServices.layer),
        );
        const transaction = yield* WorkspaceTransaction.pipe(
          Effect.provide(injected),
        );
        const exit = yield* Effect.exit(
          transaction.run({
            root,
            config,
            execute: () => Effect.fail("original execute failure"),
            validate: () => Effect.void,
          }),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(String(exit.cause)).toContain("cleanup");
          expect(String(exit.cause)).toContain("original execute failure");
        }
      }).pipe(
        Effect.provide(
          Layer.merge(WorkspaceFileOperations.layer, NodeServices.layer),
        ),
      ),
    ),
  );

  it.effect(
    "restores cwd inside the workspace after success and rollback",
    () =>
      Effect.gen(function* () {
        const root = yield* temporaryRoot();
        const nested = Path.join(root, "nested");
        yield* io(() => Fs.mkdir(nested, { recursive: true }));
        const previous = process.cwd();
        process.chdir(nested);
        const transaction = yield* WorkspaceTransaction;
        yield* transaction.run({
          root,
          config,
          execute: () => Effect.void,
          validate: () => Effect.void,
        });
        expect(process.cwd()).toBe(nested);
        const failed = yield* Effect.exit(
          transaction.run({
            root,
            config,
            execute: () => Effect.fail("rollback"),
            validate: () => Effect.void,
          }),
        );
        expect(Exit.isFailure(failed)).toBe(true);
        expect(process.cwd()).toBe(nested);
        process.chdir(previous);
      }).pipe(Effect.provide(layer)),
  );

  it.effect("rejects lock contention deterministically", () =>
    Effect.gen(function* () {
      const root = yield* temporaryRoot();
      const lock = Path.join(
        Path.dirname(root),
        `.${Path.basename(root)}.stack-effect.lock`,
      );
      yield* io(() => Fs.writeFile(lock, "held"));
      const transaction = yield* WorkspaceTransaction;
      const exit = yield* Effect.exit(
        transaction.run({
          root,
          config,
          execute: () => Effect.void,
          validate: () => Effect.void,
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(String(exit.cause)).toContain(
          "Workspace transaction already active",
        );
      }
      yield* io(() => Fs.rm(lock));
    }).pipe(Effect.provide(layer)),
  );
});
