import { assert, describe, it } from "@effect/vitest";
import * as MockTerminal from "@repo/tui/test/MockTerminal";
import { Effect } from "effect";
import {
  catalogSourcesFixture,
  urls,
  withNodeServices,
} from "../fixtures/catalogSources";

describe("add", () => {
  it.effect(
    "preserves customized docs starter files when reapplying the target with --yes",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, fs, path } = yield* catalogSourcesFixture;
          yield* run([
            "create",
            "handbook",
            "--target",
            "docs/",
            "--yes",
            "--no-git",
            "--root",
            directory,
          ]);
          const root = path.join(directory, "handbook");
          const edits = [
            ["apps/docs/app/components/callout.tsx", "// Custom callout"],
            ["apps/docs/app/content/index.mdx", "# Custom handbook"],
            ["apps/docs/.gitignore", "/drafts/"],
          ] as const;

          yield* Effect.forEach(edits, ([file, contents]) =>
            fs.writeFileString(path.join(root, file), contents),
          );
          yield* run(["add", "--target", "docs/", "--yes", "--root", root]);
          yield* Effect.forEach(edits, ([file, contents]) =>
            Effect.map(fs.readFileString(path.join(root, file)), (actual) =>
              assert.strictEqual(actual, contents),
            ),
          );
        }),
      ),
    30_000,
  );

  it.effect(
    "should offer providers for a capability that a selected module requires through a dependency",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, fs, path } = yield* catalogSourcesFixture;
          const root = path.join(directory, "shop");
          yield* fs.makeDirectory(root);
          yield* fs.writeFileString(
            path.join(root, "stack.effect.json"),
            JSON.stringify({
              name: "shop",
              runtime: { _tag: "bun" },
              catalogs: [{ name: "providers", url: urls.providers }],
            }),
          );

          const { stdout } = yield* run(["add", "--root", root, "--dry-run"], {
            input: Effect.forEach(
              [
                MockTerminal.inputKey("enter"), // target kind: api
                MockTerminal.inputText("svc"),
                MockTerminal.inputKey("enter"),
                MockTerminal.inputKey("space"), // module: api-todos
                MockTerminal.inputKey("enter"),
                MockTerminal.inputKey("enter"), // Confirm all
                MockTerminal.inputKey("enter"), // provider: sql-sqlite
                MockTerminal.inputKey("enter"), // Confirm all
              ],
              (input) => input,
              { discard: true },
            ),
          });
          const output = stdout.join("\n");

          assert.include(
            output,
            'Module "todo-repository" requires db-sql. Which provider should be added to packages/db?',
          );
          assert.include(output, "sql-postgres");
          assert.include(output, "packages/db#sql-sqlite");
        }),
      ),
    30_000,
  );

  it.effect(
    "should ask the first requester in target order where a shared implied module goes",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, fs, path } = yield* catalogSourcesFixture;
          const root = path.join(directory, "shop");
          yield* fs.makeDirectory(root);
          yield* fs.writeFileString(
            path.join(root, "stack.effect.json"),
            JSON.stringify({
              name: "shop",
              runtime: { _tag: "bun" },
              catalogs: [{ name: "implications", url: urls.implications }],
            }),
          );

          const { stdout } = yield* run(["add", "--root", root, "--dry-run"], {
            input: Effect.forEach(
              [
                MockTerminal.inputKey("enter"), // target kind: app
                MockTerminal.inputText("shell"),
                MockTerminal.inputKey("enter"),
                MockTerminal.inputKey("space"), // module: origin
                MockTerminal.inputKey("enter"),
                MockTerminal.inputText("api"), // server for relay
                MockTerminal.inputKey("enter"),
                MockTerminal.inputText("web"), // client for client-base
                MockTerminal.inputKey("enter"),
                MockTerminal.inputText("lib"), // package for library
                MockTerminal.inputKey("enter"),
                MockTerminal.inputText("jobs"), // worker for job
                MockTerminal.inputKey("enter"),
                MockTerminal.inputKey("enter"), // Confirm all
              ],
              (input) => input,
              { discard: true },
            ),
          });
          const output = stdout.join("\n");

          assert.include(
            output,
            'Module "relay-client" requires a worker target',
          );
          assert.notInclude(
            output,
            'Module "library" requires a worker target',
          );
        }),
      ),
    30_000,
  );
});
