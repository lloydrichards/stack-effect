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
    "installs Mermaid dependencies without resetting a customized docs dev script",
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
          const manifest = path.join(root, "apps/docs/package.json");
          const original = yield* fs.readFileString(manifest);
          yield* fs.writeFileString(
            manifest,
            original.replace("--port 5175", "--port 5180"),
          );
          yield* run([
            "add",
            "--target",
            "docs/:docs-mermaid",
            "--yes",
            "--root",
            root,
          ]);
          const contents = yield* fs.readFileString(manifest);
          assert.include(contents, "react-router dev --port 5180");
          assert.include(contents, '"mdx-mermaid":');
          assert.include(
            yield* fs.readFileString(
              path.join(root, "apps/docs/vite.config.ts"),
            ),
            "configureMdx(remarkGfm, mdxMermaid)",
          );
        }),
      ),
    30_000,
  );

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
    "uses the catalog-default provider folder for prompts and flags",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, fs, path } = yield* catalogSourcesFixture;
          const root = path.join(directory, "shop");
          yield* fs.makeDirectory(path.join(root, "apps/server-api"), {
            recursive: true,
          });
          yield* fs.writeFileString(
            path.join(root, "apps/server-api/package.json"),
            '{"name":"server-api"}',
          );
          yield* fs.writeFileString(
            path.join(root, "stack.effect.json"),
            JSON.stringify({
              name: "shop",
              runtime: { _tag: "bun" },
              catalogs: [{ name: "providers", url: urls.providers }],
            }),
          );
          const add = ["add", "--root", root, "--dry-run"];
          const interactive = yield* run(add, {
            input: Effect.forEach(
              [
                MockTerminal.inputKey("enter"),
                MockTerminal.inputText("svc"),
                MockTerminal.inputKey("enter"),
                MockTerminal.inputKey("down"),
                MockTerminal.inputKey("space"),
                MockTerminal.inputKey("enter"),
                MockTerminal.inputKey("enter"),
                MockTerminal.inputKey("enter"),
              ],
              (input) => input,
              { discard: true },
            ),
          });
          const flags = yield* run([...add, "--target", "api/svc:api-web"]);
          for (const result of [interactive, flags]) {
            assert.include(result.stdout.join("\n"), "apps/server-api");
            assert.notInclude(result.stdout.join("\n"), "apps/api/");
          }
        }),
      ),
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
