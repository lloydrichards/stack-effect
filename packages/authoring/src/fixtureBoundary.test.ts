import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

const allowed = [
  /^@repo\/authoring$/,
  /^effect(\/.*)?$/,
  /^@effect\/platform-[a-z]+$/,
];

const specifiersIn = (source: string): ReadonlyArray<string> =>
  [
    ...source.matchAll(
      /(?:\bfrom|\bimport|\brequire)\s*\(?\s*(["'`])([^"'`]+)\1/g,
    ),
  ].map((match) => match[2] ?? "");

/** Imports that leave the fixture or reach past the public authoring entry. */
const boundaryViolations = (
  path: Path.Path,
  fixture: string,
  file: string,
  source: string,
): ReadonlyArray<string> =>
  specifiersIn(source)
    .filter((specifier) =>
      specifier.startsWith(".")
        ? path
            .relative(
              fixture,
              path.resolve(path.dirname(path.join(fixture, file)), specifier),
            )
            .startsWith("..")
        : !allowed.some((pattern) => pattern.test(specifier)),
    )
    .map((specifier) => `${file}: ${specifier}`);

layer(NodeServices.layer)("fixture boundary", (it) => {
  it.effect(
    "should report each escaping import when a source mixes allowed and forbidden imports",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const source = [
          `import { buildCatalog } from "@repo/authoring";`,
          `import type { Schema } from "effect";`,
          `import { local } from "./local";`,
          `import { official } from '@repo/catalog';`,
          `export * from "../../../src/index";`,
          `import "@repo/domain/Catalog";`,
          `const fs = require("node:fs");`,
          "const lazy = import(`apps/docs`);",
        ].join("\n");
        assert.deepStrictEqual(
          boundaryViolations(path, "/fixture", "catalog.ts", source),
          [
            "catalog.ts: @repo/catalog",
            "catalog.ts: ../../../src/index",
            "catalog.ts: @repo/domain/Catalog",
            "catalog.ts: node:fs",
            "catalog.ts: apps/docs",
          ],
        );
      }),
  );

  it.effect(
    "should find no escaping import when the standalone fixture is scanned",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const fixture = yield* path.fromFileUrl(
          new URL("../test/fixtures/standalone/", import.meta.url),
        );
        const files = (yield* fs.readDirectory(fixture, { recursive: true }))
          .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
          .filter((file) => !file.split(path.sep).includes("templates"));
        assert.isNotEmpty(files);

        const violations = yield* Effect.forEach(files, (file) =>
          fs
            .readFileString(path.join(fixture, file))
            .pipe(
              Effect.map((source) =>
                boundaryViolations(path, fixture, file, source),
              ),
            ),
        );
        assert.deepStrictEqual(violations.flat(), []);
      }),
  );
});
