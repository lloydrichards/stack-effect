import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { StackEffectServicesLayer } from "../services";
import { runCommandAcceptance } from "../test-support/CommandAcceptanceHarness";

const services = StackEffectServicesLayer.pipe(
  Layer.provideMerge(NodeServices.layer),
);
const config = `${JSON.stringify({ name: "acceptance", runtime: { _tag: "bun" }, typescript: "7" }, null, 2)}\n`;
const dddTodoApiConfig = `${JSON.stringify(
  {
    name: "acceptance",
    runtime: { _tag: "bun" },
    typescript: "7",
    targets: [
      {
        identity: { kind: "server", name: "api" },
        architecture: "ddd",
      },
    ],
  },
  null,
  2,
)}\n`;

const workspace = <A, E, R>(use: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "stack-effect-command-"))),
    (root) =>
      Effect.promise(() =>
        Promise.all([
          writeFile(join(root, "stack.effect.json"), config),
          writeFile(
            join(root, "pnpm-workspace.yaml"),
            "packages:\n  - apps/*\n  - packages/*\n",
          ),
        ]),
      ).pipe(Effect.andThen(use(root))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );

const run = (
  root: string,
  args: ReadonlyArray<string>,
  inputs: ReadonlyArray<{ readonly key: string }> = [],
) =>
  runCommandAcceptance({ args: [...args, "--root", root], inputs, services });

const snapshot = (root: string) =>
  Effect.promise(() => readFile(join(root, "stack.effect.json"), "utf8"));

const filesystemSnapshot = (root: string) =>
  Effect.promise(async () => {
    const paths = (await readdir(root, { recursive: true })).sort();
    return Promise.all(
      paths.map(async (path) => {
        try {
          return { path, contents: await readFile(join(root, path), "utf8") };
        } catch {
          return { path };
        }
      }),
    );
  });

describe("command architecture acceptance", () => {
  it.effect(
    "keeps omitted and explicit Classic command output in exact parity without architecture noise",
    () =>
      workspace((root) =>
        Effect.gen(function* () {
          const args = [
            "add",
            "--yes",
            "--dry-run",
            "--target",
            "server/api:server-http-api",
          ];
          const omitted = yield* run(root, args);
          const explicit = yield* run(root, [
            ...args,
            "--architecture",
            "classic",
          ]);
          expect(explicit.output).toEqual(omitted.output);
          expect(omitted.output.join("\n")).not.toContain("architecture");
          expect(yield* snapshot(root)).toBe(config);
        }),
      ),
  );

  it.effect(
    "rejects every invalid noninteractive DDD combination actionably and before writes",
    () =>
      workspace((root) =>
        Effect.gen(function* () {
          for (const target of [
            "server/chat:server-http-api",
            "server/todo:server-rpc-api",
            "package/domain:domain-api-contracts",
          ]) {
            const failure = yield* run(root, [
              "add",
              "--yes",
              "--architecture",
              "ddd",
              "--target",
              target,
            ]).pipe(Effect.flip);
            expect(String(failure)).toContain("server/api");
            expect(yield* snapshot(root)).toBe(config);
          }
        }),
      ),
  );

  it.effect(
    "reports the complete DDD dry-run plan and prospective record with zero side effects",
    () =>
      workspace((root) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              mkdir(join(root, "apps/server-api"), { recursive: true }),
              writeFile(join(root, "stack.effect.json"), dddTodoApiConfig),
            ]),
          );
          const args = [
            "add",
            "--yes",
            "--dry-run",
            "--show-files",
            "--architecture",
            "ddd",
            "--target",
            "server/api:server-http-api-todos",
          ];
          const mismatch = yield* run(root, [
            "add",
            "--yes",
            "--dry-run",
            "--architecture",
            "classic",
            "--target",
            "server/api:server-http-api",
          ]).pipe(Effect.flip);
          expect(String(mismatch)).toContain("Target server/api");
          expect(String(mismatch)).toContain("durable architecture ddd");
          expect(String(mismatch)).toContain("requested architecture classic");
          expect(yield* snapshot(root)).toBe(dddTodoApiConfig);
          yield* Effect.promise(() =>
            Promise.all([
              rm(join(root, "apps/server-api"), { recursive: true }),
              writeFile(join(root, "stack.effect.json"), config),
            ]),
          );
          const beforeDryRun = yield* filesystemSnapshot(root);
          const result = yield* run(root, args);
          const output = result.output.join("\n");
          for (const path of [
            "apps/server-api",
            "packages/shared/domain",
            "packages/todo/domain",
            "packages/todo/application",
            "packages/todo/infrastructure",
            "packages/todo/presentation",
          ])
            expect(output).toContain(path);
          expect(output).toContain("ddd");
          expect(output).toContain("Prospective stack config");
          expect(output).toContain('"targets": [');
          expect(output).toContain('"name": "api"');
          expect(yield* snapshot(root)).toBe(config);
          expect(yield* filesystemSnapshot(root)).toEqual(beforeDryRun);
        }),
      ),
  );

  it.effect(
    "rejects unknown canonical-owner modules and orphan DDD providers before writes",
    () =>
      workspace((root) =>
        Effect.gen(function* () {
          const before = yield* filesystemSnapshot(root);
          for (const moduleId of [
            "unknown-ddd-module",
            "server-http-api-todos-provider-sqlite",
          ]) {
            const failure = yield* run(root, [
              "add",
              "--yes",
              "--architecture",
              "ddd",
              "--target",
              `server/api:${moduleId}`,
            ]).pipe(Effect.flip);
            expect(String(failure)).toContain("server/api");
            expect(String(failure)).toContain("server-http-api-todos");
            expect(yield* snapshot(root)).toBe(config);
            expect(yield* filesystemSnapshot(root)).toEqual(before);
          }
        }),
      ),
  );

  it.effect(
    "shows and locks the exact interactive DDD six-path Todo topology",
    () =>
      workspace((root) =>
        Effect.gen(function* () {
          const result = yield* run(
            root,
            ["add", "--dry-run", "--show-files"],
            [{ key: "right" }, { key: "enter" }, { key: "enter" }],
          );
          const output = result.output.join("\n");
          for (const text of [
            "server/api",
            "apps/server-api",
            "packages/shared/domain",
            "packages/todo/domain",
            "packages/todo/application",
            "packages/todo/infrastructure",
            "packages/todo/presentation",
            "Todo HTTP is locked",
          ])
            expect(output).toContain(text);
          expect(yield* snapshot(root)).toBe(config);
        }),
      ),
  );

  it.effect(
    "cancels interactive DDD with no transaction, config, or generated files",
    () =>
      workspace((root) =>
        Effect.gen(function* () {
          const failure = yield* run(
            root,
            ["add"],
            [
              { key: "right" },
              { key: "enter" },
              { key: "right" },
              { key: "enter" },
            ],
          ).pipe(Effect.flip);
          expect(String(failure)).toContain("cancelled");
          expect(yield* snapshot(root)).toBe(config);
        }),
      ),
  );

  it.effect("init has no architecture option", () =>
    workspace((root) =>
      Effect.gen(function* () {
        const failure = yield* run(root, [
          "init",
          ".",
          "--yes",
          "--architecture",
          "ddd",
        ]).pipe(Effect.flip);
        expect(String(failure)).toContain("ShowHelp");
        expect(yield* snapshot(root)).toBe(config);
      }),
    ),
  );
});
