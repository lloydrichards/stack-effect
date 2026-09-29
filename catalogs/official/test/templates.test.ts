import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

// Git and the repository's formatter and linter read these names in nested
// directories, so a template stored under one would change what they track or
// rewrite. Store them with a leading underscore instead, e.g. `_gitignore`.
const toolControlled = new Set([
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".eslintignore",
  ".oxfmtrc.json",
  ".oxfmtrc.jsonc",
  ".oxlintrc.json",
  ".editorconfig",
]);

// Every catalog workspace sits beside this one; its turbo.json lists their
// templates as test inputs so a change there reruns this test.
const catalogsUrl = new URL("../../", import.meta.url);

layer(NodeServices.layer)("catalog templates", (it) => {
  it.effect(
    "should store no template under a tool-controlled name when any catalog's templates are scanned",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const catalogsDir = yield* path.fromFileUrl(catalogsUrl);
        const catalogs = yield* Effect.filter(
          yield* fs.readDirectory(catalogsDir),
          (name) => fs.exists(path.join(catalogsDir, name, "templates")),
        );
        assert.includeMembers(catalogs, ["official", "author"]);

        const files = yield* Effect.forEach(catalogs, (name) =>
          fs
            .readDirectory(path.join(catalogsDir, name, "templates"), {
              recursive: true,
            })
            .pipe(
              Effect.map((files) =>
                files.map((file) => path.join(name, "templates", file)),
              ),
            ),
        );
        assert.isTrue(files.every((catalogFiles) => catalogFiles.length > 0));
        assert.deepStrictEqual(
          files
            .flat()
            .filter((file) => toolControlled.has(path.basename(file))),
          [],
        );
      }),
  );
});
