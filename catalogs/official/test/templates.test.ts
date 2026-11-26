import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { EFFECT_VERSION } from "@repo/catalog-official/dependencies";
import { buildOfficialCatalog } from "@repo/catalog-official/service";
import { Array as Arr, Effect, FileSystem, Path } from "effect";

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
const officialTemplatesUrl = new URL("../templates/", import.meta.url);

// These ship on their own release lines; every other Effect package shares one version.
const independentlyVersioned = new Set([
  "@effect/tsgo",
  "@effect/language-service",
]);
const effectPackagePattern =
  /(?:^|[}"\s])(effect|@effect\/[a-z-]+)(?=$|[{"\s])/g;
const versionedEntryPattern = /"([^"]+)"\s*:\s*"([^"]+)"/g;

const effectPackages = (name: string) =>
  [...name.matchAll(effectPackagePattern)].flatMap(([, pkg]) =>
    pkg === undefined || independentlyVersioned.has(pkg) ? [] : [pkg],
  );

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

  it.effect(
    "should keep one template file when owners would hold identical bytes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const templatesDir = yield* path.fromFileUrl(officialTemplatesUrl);
        const entries = yield* fs.readDirectory(templatesDir, {
          recursive: true,
        });
        const files = yield* Effect.filter(entries, (file) =>
          fs
            .stat(path.join(templatesDir, file))
            .pipe(Effect.map((info) => info.type === "File")),
        );
        const contents = yield* Effect.forEach(files, (file) =>
          fs
            .readFileString(path.join(templatesDir, file))
            .pipe(Effect.map((text) => ({ file, text }))),
        );

        const sharedAcrossOwners = Object.values(
          Arr.groupBy(contents, ({ text }) => text),
        )
          .map((group) => group.map(({ file }) => file))
          .filter(
            (group) =>
              new Set(group.map((file) => file.split(path.sep)[0])).size > 1,
          );
        assert.isAbove(files.length, 0);
        assert.deepStrictEqual(sharedAcrossOwners, []);
      }),
  );

  it.effect(
    "should pin every Effect package to one version across contributions and template manifests",
    () =>
      Effect.gen(function* () {
        const { document } = yield* buildOfficialCatalog;
        const contributions = [
          ...document.targets,
          ...document.modules,
        ].flatMap((definition) => definition.contributions);
        const pins = contributions.flatMap((contribution) => {
          if (contribution._tag === "pkg-json-entry") {
            return effectPackages(contribution.name).map((pkg) => ({
              pkg,
              version: contribution.value,
            }));
          }
          if (
            contribution._tag === "file" &&
            /(package\.json|\.yaml)$/.test(contribution.path)
          ) {
            return [
              ...contribution.contents.matchAll(versionedEntryPattern),
            ].flatMap(([, name, version]) =>
              effectPackages(`"${name}"`).map((pkg) => ({ pkg, version })),
            );
          }
          return [];
        });

        assert.includeDeepMembers(
          pins.map(({ pkg }) => pkg),
          [
            "effect",
            "@effect/platform-browser",
            "@effect/platform-node-shared",
          ],
        );
        for (const { pkg, version } of pins) {
          assert.strictEqual(version, EFFECT_VERSION, pkg);
        }
      }),
  );
});
