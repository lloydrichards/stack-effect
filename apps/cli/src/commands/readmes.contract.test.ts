import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import {
  catalogSourcesFixture,
  withNodeServices,
} from "./catalogSources.fixture";

describe("generated README CLI contract", () => {
  it.effect(
    "keeps the initial recipe and user-written guides during add --yes",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory } = yield* catalogSourcesFixture;
          const fs = yield* FileSystem.FileSystem;
          const root = `${directory}/readme-app`;
          yield* run([
            "create",
            "readme-app",
            "--root",
            directory,
            "--target",
            "package/library:package-library",
            "--yes",
            "--no-git",
          ]);
          const initial = yield* fs.readFileString(`${root}/README.md`);
          assert.include(initial, "## Initial scaffold recipe");
          assert.include(initial, "--target package/library:package-library");
          assert.include(initial, "https://stack-effect.lloydrichards.dev");
          const rootContents = `${initial}\nOur team's setup instructions.\n`;
          const libraryContents =
            "# Our library\n\nOur public API documentation.\n";
          yield* fs.writeFileString(`${root}/README.md`, rootContents);
          yield* fs.writeFileString(
            `${root}/packages/library/README.md`,
            libraryContents,
          );
          yield* run([
            "add",
            "--root",
            root,
            "--target",
            "package/library:package-library",
            "--target",
            "server/api:server-http-api",
            "--yes",
          ]);
          assert.strictEqual(
            yield* fs.readFileString(`${root}/README.md`),
            rootContents,
          );
          assert.strictEqual(
            yield* fs.readFileString(`${root}/packages/library/README.md`),
            libraryContents,
          );
          assert.include(
            yield* fs.readFileString(`${root}/apps/server-api/README.md`),
            "ALLOWED_ORIGINS",
          );
          assert.isTrue(
            yield* fs.exists(`${root}/apps/server-api/src/index.ts`),
          );
        }),
      ),
  );
});
