import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";
import { CLI } from "./harness";

const fixtureContents = `import { Effect, Schema } from "effect";

export const now = Effect.gen(function* () {
  Schema.decodeSync(Schema.String)("value");
  return new Date();
});

export const random = Math.random();
export const numberSchema = Schema.Number;
`;

const testBoundaryContents = `import path from "node:path";

export const parsed = JSON.parse("{}");
export const joined = path.join("a", "b");
`;

const smokeConfigContents = `{
  "extends": "./tsconfig.json",
  "files": ["src/effect-lsp-smoke.ts"]
}
`;

const createCommand = (
  projectName: string,
  typescript: "6" | "7",
  options: {
    readonly format?: "dprint";
    readonly lint?: "biome" | "oxlint";
    readonly monorepo?: "turbo" | "vite-plus";
  } = {},
) =>
  [
    "create",
    projectName,
    "--target",
    "cli/app:cli-command-hello",
    "--typescript",
    typescript,
    ...(options.format === undefined ? [] : ["--format", options.format]),
    ...(options.lint === undefined ? [] : ["--lint", options.lint]),
    ...(options.monorepo === undefined ? [] : ["--monorepo", options.monorepo]),
    "--yes",
    "--no-git",
  ] as const;

describe("generated language services", () => {
  layer(CLI.layer)("full catalog", (it) => {
    it.effect(
      "should generate the full catalog without Effect lint warnings",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const catalogRoot = `${cli.workdir}/catalog-built`;

          yield* cli.run(
            "catalog",
            "workspace",
            "reset",
            "--root",
            catalogRoot,
          );
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "catalog",
            "workspace",
            "validate",
            "--root",
            catalogRoot,
          );
          yield* cli.expectExitCode(0);
        }),
      { timeout: 120_000 },
    );
  });

  layer(CLI.layer)("layer", (it) => {
    it.effect(
      "should report Effect diagnostics through patched tsc when TypeScript 6 is selected",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const projectName = "typescript-6-lsp";

          yield* cli.run(
            ...createCommand(projectName, "6"),
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject(projectName, function* (project) {
            yield* project.expectFileNotContaining(
              "package.json",
              '"@effect/tsgo"',
            );
            yield* project.expectFileNotContaining(
              "package.json",
              '"oxlint-tsgolint"',
            );
            yield* project.expectFileNotContaining(
              "package.json",
              "effect-tsgo patch --oxlint",
            );
            yield* project.writeFile(
              "apps/cli-app/src/effect-lsp-smoke.ts",
              fixtureContents,
            );
            yield* project.writeFile(
              "apps/cli-app/tsconfig.effect-lsp-smoke.json",
              smokeConfigContents,
            );
            yield* project.expectFileNotContaining(
              ".vscode/settings.json",
              "js/ts.experimental.useTsgo",
            );
            yield* project.expectFileNotContaining(
              "packages/config-typescript/base.json",
              '"schemaNumber"',
            );
            yield* project.expectFileNotContaining(
              "packages/config-typescript/base.json",
              '"schemaSyncInEffect"',
            );

            const diagnostics = yield* project.exec(
              "./node_modules/.bin/tsc",
              "--noEmit",
              "--project",
              "apps/cli-app/tsconfig.effect-lsp-smoke.json",
            );
            assert.notStrictEqual(
              diagnostics.exitCode,
              0,
              `${diagnostics.stdout}\n${diagnostics.stderr}`,
            );
            assert.match(
              `${diagnostics.stdout}\n${diagnostics.stderr}`,
              /globalDateInEffect/,
            );
            assert.match(
              `${diagnostics.stdout}\n${diagnostics.stderr}`,
              /globalRandom/,
            );
          });
        }),
      { timeout: 60_000 },
    );

    it.effect(
      "should enable TSGo in VS Code when TypeScript 7 is selected",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const projectName = "typescript-7-editor-settings";

          yield* cli.run(
            ...createCommand(projectName, "7", { lint: "biome" }),
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject(projectName, function* (project) {
            yield* project.expectFileContaining(
              ".vscode/settings.json",
              '"js/ts.experimental.useTsgo": true',
            );
            yield* project.expectFileContaining(
              ".vscode/settings.json",
              '"js/ts.tsdk.path": "./node_modules/typescript/bin"',
            );
          });
        }),
      { timeout: 60_000 },
    );

    it.effect(
      "should report Effect diagnostics through TSGo when TypeScript 7 is selected",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const projectName = "typescript-7-lsp";

          yield* cli.run(
            ...createCommand(projectName, "7", { lint: "biome" }),
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject(projectName, function* (project) {
            yield* project.writeFile(
              "apps/cli-app/src/effect-lsp-smoke.ts",
              fixtureContents,
            );
            yield* project.writeFile(
              "apps/cli-app/tsconfig.effect-lsp-smoke.json",
              smokeConfigContents,
            );

            const diagnostics = yield* project.exec(
              "./node_modules/.bin/effect-tsgo",
              "diagnostics",
              "--project",
              "apps/cli-app/tsconfig.effect-lsp-smoke.json",
              "--format",
              "json",
            );
            assert.strictEqual(diagnostics.exitCode, 0);

            const output = JSON.parse(diagnostics.stdout);
            assert.isTrue(
              output.diagnostics.some(
                (diagnostic: { readonly name: string }) =>
                  diagnostic.name === "globalDateInEffect",
              ),
              diagnostics.stdout,
            );
            assert.isTrue(
              output.diagnostics.some(
                (diagnostic: { readonly name: string }) =>
                  diagnostic.name === "globalRandom",
              ),
              diagnostics.stdout,
            );
            assert.isTrue(
              output.diagnostics.some(
                (diagnostic: { readonly name: string }) =>
                  diagnostic.name === "schemaNumber",
              ),
              diagnostics.stdout,
            );
            assert.isTrue(
              output.diagnostics.some(
                (diagnostic: { readonly name: string }) =>
                  diagnostic.name === "schemaSyncInEffect",
              ),
              diagnostics.stdout,
            );
          });
        }),
      { timeout: 60_000 },
    );
    it.effect(
      "should fail standalone Oxlint on an Effect-native diagnostic",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const projectName = "typescript-7-turbo-effect-oxlint";

          yield* cli.run(
            ...createCommand(projectName, "7", {
              format: "dprint",
              lint: "oxlint",
              monorepo: "turbo",
            }),
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject(projectName, function* (project) {
            yield* project.expectFileContaining(
              "package.json",
              '"prepare": "effect-tsgo patch --oxlint"',
            );
            yield* project.expectFileContaining(
              "package.json",
              '"oxlint-tsgolint": "7.0.2001"',
            );
            yield* project.expectFileContaining(
              ".oxlintrc.json",
              "oxlint-presets/recommended.json",
            );
            yield* project.expectFileContaining(
              ".oxlintrc.json",
              "oxlint-presets/effect-native.json",
            );
            yield* project.writeFile(
              "apps/cli-app/src/effect-lsp-smoke.ts",
              fixtureContents,
            );
            yield* project.writeFile(
              "apps/cli-app/src/effect-lsp-boundary.test.ts",
              testBoundaryContents,
            );

            const lint = yield* project.exec("bun", "run", "lint");
            const output = `${lint.stdout}\n${lint.stderr}`;
            assert.notStrictEqual(lint.exitCode, 0, output);
            assert.strictEqual(
              output.match(/effecttsgo\(global-date-in-effect\)/g)?.length,
              1,
              output,
            );
            assert.notMatch(
              output,
              /effecttsgo\((node-builtin-import|prefer-schema-over-json)\)/,
            );
          });
        }),
      { timeout: 60_000 },
    );

    it.effect(
      "should enable TSGo in VS Code when TypeScript 7 uses dprint and oxlint",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const projectName = "typescript-7-dprint-oxlint";

          yield* cli.run(
            ...createCommand(projectName, "7", {
              format: "dprint",
              lint: "oxlint",
            }),
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject(projectName, function* (project) {
            yield* project.expectFileContaining(
              ".vscode/settings.json",
              '"editor.defaultFormatter": "dprint.dprint"',
            );
            yield* project.expectFileContaining(
              ".vscode/settings.json",
              '"js/ts.experimental.useTsgo": true',
            );
            yield* project.expectFileContaining(
              "package.json",
              '"prepare": "effect-tsgo patch --oxlint"',
            );
            yield* project.expectFileNotContaining(
              "package.json",
              '"oxlint-tsgolint"',
            );
            yield* project.expectFileContaining(
              "vite.config.ts",
              'from "@effect/tsgo/oxlint-presets"',
            );
            yield* project.expectFileContaining(
              "vite.config.ts",
              "extends: [recommended, effectNative]",
            );
            yield* project.writeFile(
              "apps/cli-app/src/effect-lsp-smoke.ts",
              fixtureContents,
            );
            yield* project.writeFile(
              "apps/cli-app/src/effect-lsp-boundary.test.ts",
              testBoundaryContents,
            );

            const lint = yield* project.exec("bun", "run", "lint");
            const output = `${lint.stdout}\n${lint.stderr}`;
            assert.notStrictEqual(lint.exitCode, 0, output);
            assert.strictEqual(
              output.match(/effecttsgo\(global-date-in-effect\)/g)?.length,
              1,
              output,
            );
            assert.notMatch(
              output,
              /effecttsgo\((node-builtin-import|prefer-schema-over-json)\)/,
            );
          });
        }),
      { timeout: 60_000 },
    );
  });
});
