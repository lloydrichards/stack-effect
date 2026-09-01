import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";
import { CLI } from "./harness";

const fixtureContents = `import { Effect } from "effect";

export const now = Effect.gen(function* () {
  return new Date();
});
`;

const smokeConfigContents = `{
  "extends": "./tsconfig.json",
  "files": ["src/effect-lsp-smoke.ts"]
}
`;

const createCommand = (projectName: string, typescript: "6" | "7") =>
  [
    "create",
    projectName,
    "--target",
    "cli/app:cli-command-hello",
    "--typescript",
    typescript,
    "--yes",
    "--no-git",
  ] as const;

describe("generated language services", () => {
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

            const diagnostics = yield* project.exec(
              "./node_modules/.bin/tsc",
              "--noEmit",
              "--project",
              "apps/cli-app/tsconfig.effect-lsp-smoke.json",
            );
            assert.strictEqual(
              diagnostics.exitCode,
              0,
              `${diagnostics.stdout}\n${diagnostics.stderr}`,
            );
            assert.match(
              `${diagnostics.stdout}\n${diagnostics.stderr}`,
              /globalDateInEffect/,
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
            ...createCommand(projectName, "7"),
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
            ...createCommand(projectName, "7"),
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
          });
        }),
      { timeout: 60_000 },
    );
  });
});
