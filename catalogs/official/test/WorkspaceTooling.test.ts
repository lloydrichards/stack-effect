import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const helperUrl = new URL(
  "../templates/workspace-monorepo-nx/scripts/hash-env.mjs",
  import.meta.url,
);

layer(NodeServices.layer)("workspace tooling", (it) => {
  it.effect(
    "Nx hashes flat and nested owners without entering package content",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "nx-owner-hash-",
        });
        const helper = yield* path.fromFileUrl(helperUrl);
        const write = (relative: string, contents: string) =>
          Effect.gen(function* () {
            const destination = path.join(root, relative);
            yield* fs.makeDirectory(path.dirname(destination), {
              recursive: true,
            });
            yield* fs.writeFileString(destination, contents);
          });
        const hash = () =>
          Effect.scoped(
            Effect.gen(function* () {
              const child = yield* spawner.spawn(
                ChildProcess.make("node", [helper], {
                  cwd: root,
                  shell: false,
                  stdin: "ignore",
                }),
              );
              const output = yield* Effect.all(
                {
                  stdout: Stream.mkString(Stream.decodeText(child.stdout)),
                  stderr: Stream.mkString(Stream.decodeText(child.stderr)),
                  exitCode: child.exitCode,
                },
                { concurrency: "unbounded" },
              );
              assert.strictEqual(output.exitCode, 0, output.stderr);
              return output.stdout;
            }),
          );
        const owners = [
          "apps/server-api",
          "apps/sdk/server-worker",
          "packages/domain",
          "packages/sdk/client",
        ];
        yield* Effect.forEach(owners, (owner) =>
          write(`${owner}/package.json`, '{"name":"owner"}'),
        );
        const empty = yield* hash();
        yield* Effect.forEach(owners, (owner) =>
          Effect.gen(function* () {
            const before = yield* hash();
            yield* write(`${owner}/.env`, "FIRST");
            const added = yield* hash();
            assert.notStrictEqual(added, before);
            yield* write(`${owner}/.env`, "SECOND");
            assert.notStrictEqual(yield* hash(), added);
            yield* fs.remove(path.join(root, owner, ".env"));
          }),
        );
        yield* Effect.forEach(["build", ".fixtures"], (directory) =>
          Effect.gen(function* () {
            const contents = `packages/sdk/client/${directory}/example`;
            yield* write(`${contents}/package.json`, '{"name":"fixture"}');
            yield* write(`${contents}/.env`, "IGNORED");
          }),
        );
        yield* write(
          "packages/sdk/node_modules/dependency/package.json",
          '{"name":"dependency"}',
        );
        yield* write("packages/sdk/node_modules/dependency/.env", "IGNORED");
        assert.strictEqual(yield* hash(), empty);
        yield* write(".env", "ROOT");
        assert.notStrictEqual(yield* hash(), empty);
      }),
  );

  it.effect("Nx rejects symbolic grouping directories", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "nx-group-link-",
      });
      yield* fs.makeDirectory(path.join(root, "packages"));
      yield* fs.makeDirectory(path.join(root, "outside"));
      yield* fs.symlink(
        path.join(root, "outside"),
        path.join(root, "packages", "sdk"),
      );
      const child = yield* spawner.spawn(
        ChildProcess.make("node", [yield* path.fromFileUrl(helperUrl)], {
          cwd: root,
          shell: false,
          stdin: "ignore",
        }),
      );
      const output = yield* Effect.all(
        {
          stdout: Stream.mkString(Stream.decodeText(child.stdout)),
          stderr: Stream.mkString(Stream.decodeText(child.stderr)),
          exitCode: child.exitCode,
        },
        { concurrency: "unbounded" },
      );
      assert.notStrictEqual(output.exitCode, 0);
      assert.include(
        output.stderr,
        "Symbolic workspace grouping directory is unsupported",
      );
    }),
  );
});
