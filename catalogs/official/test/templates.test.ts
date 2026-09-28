import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

// Git and the repository's formatter and linter read these names in nested
// directories, so a template stored under one would change what they track or
// rewrite. Store them with a leading underscore instead, e.g. `_gitignore`.
const toolControlled = new Set([
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".oxfmtrc.json",
  ".oxfmtrc.jsonc",
  ".oxlintrc.json",
]);

it.effect("stores no template under a name repository tools interpret", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const templates = yield* path.fromFileUrl(
      new URL("../templates/", import.meta.url),
    );
    const files = yield* fs.readDirectory(templates, { recursive: true });
    assert.isNotEmpty(files);
    assert.deepStrictEqual(
      files.filter((file) => toolControlled.has(path.basename(file))),
      [],
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);
