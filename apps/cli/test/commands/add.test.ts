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
});
