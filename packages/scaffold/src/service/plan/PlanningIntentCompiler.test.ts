import { describe, expect, it } from "@effect/vitest";
import { Contribution, TargetKey } from "@repo/domain/Catalog";
import { NormalizedContributions } from "@repo/domain/Scaffold";
import { Effect, Exit } from "effect";
import { PlanningIntentCompiler } from "./PlanningIntentCompiler";

const compile = (contributions: ReadonlyArray<typeof Contribution.Type>) =>
  Effect.gen(function* () {
    const compiler = yield* PlanningIntentCompiler;
    return yield* compiler.compile(
      NormalizedContributions.make({
        targets: [
          {
            targetKey: TargetKey.make("workspace/."),
            contributions,
          },
        ],
        modules: [],
      }),
    );
  }).pipe(Effect.provide(PlanningIntentCompiler.layer));

const authoritative = (contents: string) =>
  Contribution.cases.file.make({ path: "package.json", contents });
const dependency = (value: string) =>
  Contribution.cases["pkg-json-entry"].make({
    path: "package.json",
    field: "dependencies",
    name: "effect",
    value,
  });
const workspace = (value: string) =>
  Contribution.cases["json-array-entry"].make({
    path: "package.json",
    field: "workspaces",
    value,
  });

describe("PlanningIntentCompiler compatible root JSON intent family", () => {
  it.effect(
    "compiles authoritative, package.json, and workspace entries into one path",
    () =>
      Effect.gen(function* () {
        const contents = '{"name":"root","workspaces":["apps/*"]}\n';
        const result = yield* compile([
          authoritative(contents),
          dependency("^4.0.0"),
          workspace("packages/*/*"),
        ]);

        expect(result).toEqual([
          expect.objectContaining({
            path: "package.json",
            contents,
            dependencies: [
              { section: "dependencies", name: "effect", value: "^4.0.0" },
            ],
            workspaceEntries: [
              {
                _tag: "workspaceEntry",
                path: "package.json",
                fileType: "json",
                key: "workspaces",
                value: "packages/*/*",
              },
            ],
          }),
        ]);
      }),
  );

  it.effect("rejects conflicting duplicates within the compatible triple", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        compile([
          authoritative("{}\n"),
          dependency("^4.0.0"),
          dependency("^5.0.0"),
          workspace("packages/*/*"),
        ]),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(String(exit.cause)).toContain(
          "Conflicting package.json dependency outcomes for package.json.",
        );
      }
    }),
  );

  it.effect(
    "rejects conflicting workspace entry shapes within the compatible triple",
    () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          compile([
            authoritative("{}\n"),
            dependency("^4.0.0"),
            workspace("packages/*/*"),
            Contribution.cases["yaml-sequence-entry"].make({
              path: "package.json",
              key: "packages",
              value: "packages/*/*",
            }),
          ]),
        );

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(String(exit.cause)).toContain(
            "Conflicting workspace entry outcomes for package.json.",
          );
        }
      }),
  );

  it.effect("does not allow an unrelated three-family combination", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        compile([
          dependency("^4.0.0"),
          workspace("packages/*/*"),
          Contribution.cases["barrel-export"].make({
            barrelPath: "package.json",
            exportPath: "./other",
          }),
        ]),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(String(exit.cause)).toContain(
          "Conflicting planning intents for package.json.",
        );
      }
    }),
  );
});
