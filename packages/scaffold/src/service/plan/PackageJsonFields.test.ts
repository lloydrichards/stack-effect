import { describe, expect, it } from "@effect/vitest";
import { Contribution, ModuleId, TargetKey } from "@repo/domain/Catalog";
import { PlanFailure } from "@repo/domain/Plan";
import { Effect, Layer, Schema } from "effect";
import { JsonComposer } from "../apply/JsonComposer";
import { PlanAssessor } from "./PlanAssessor";
import { PlanningIntentCompiler } from "./PlanningIntentCompiler";

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Json));
const parseJson = Schema.decodeSync(Schema.fromJsonString(Schema.Json));

const path = "packages/library/package.json";
const publishing: ReadonlyArray<typeof Contribution.Type> = [
  { _tag: "pkg-json-field", path, field: "private", value: false },
  { _tag: "pkg-json-field", path, field: "files", value: ["dist"] },
  {
    _tag: "pkg-json-field",
    path,
    field: "exports",
    value: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
  },
  {
    _tag: "pkg-json-field",
    path,
    field: "peerDependencies",
    value: { effect: "4.0.0" },
  },
  { _tag: "pkg-json-field", path, field: "dependencies", value: {} },
];

const compile = (contributions: ReadonlyArray<typeof Contribution.Type>) =>
  Effect.gen(function* () {
    const compiler = yield* PlanningIntentCompiler;
    const paths = yield* compiler.compile({
      targets: [],
      modules: [
        {
          targetKey: TargetKey.make("packages/library"),
          moduleId: ModuleId.make("package-library"),
          contributions,
        },
      ],
    });
    const result = paths.find((entry) => entry.path === path);
    if (result === undefined)
      return yield* Effect.die("Expected package.json intent");
    return result;
  });

const TestLayer = Layer.mergeAll(
  PlanningIntentCompiler.layer,
  PlanAssessor.layer,
  JsonComposer.layer,
);

describe("publishing package.json fields", () => {
  it.effect("reports reordered export conditions as competing outcomes", () =>
    Effect.gen(function* () {
      const assessor = yield* PlanAssessor;
      const first = {
        _tag: "pkg-json-field",
        path,
        field: "exports",
        value: { ".": { default: "./a.js", import: "./b.js" } },
      } as const;
      const second = {
        ...first,
        value: { ".": { import: "./b.js", default: "./a.js" } },
      };
      const intent = yield* compile([first]);
      expect(
        assessor.assessPlanningPath({
          planningPath: intent,
          snapshotPath: {
            _tag: "file",
            path,
            contents: json({ exports: second.value }),
          },
        }).conflicts,
      ).toEqual([{ _tag: "packageJsonField", path, field: "exports" }]);
      expect(yield* Effect.flip(compile([first, second]))).toBeInstanceOf(
        PlanFailure,
      );
    }).pipe(Effect.provide(TestLayer)),
  );
  it.effect(
    "creates a publishable manifest and leaves repeat planning unchanged",
    () =>
      Effect.gen(function* () {
        const assessor = yield* PlanAssessor;
        const composer = yield* JsonComposer;
        const intent = yield* compile([
          {
            _tag: "file",
            path,
            contents: json({
              name: "@repo/library",
              private: true,
              dependencies: { effect: "4.0.0" },
            }),
          },
          ...publishing,
        ]);
        const assessment = assessor.assessPlanningPath({
          planningPath: intent,
          snapshotPath: { _tag: "missing", path },
        });
        expect(assessment.classification).toBe("create");
        const outcome = assessor.toPlannedFileOutcome({
          planningPath: intent,
          classification: assessment.classification,
        });
        if (outcome._tag !== "composed")
          return yield* Effect.die("Expected composed manifest");
        const manifest = yield* composer.compose(
          outcome.seedContents ?? "{}",
          outcome.operations.filter(
            (operation) => operation.fileType === "json",
          ),
        );
        expect(parseJson(manifest)).toMatchObject({
          private: false,
          files: ["dist"],
          dependencies: {},
          peerDependencies: { effect: "4.0.0" },
          exports: {
            ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
          },
        });
        expect(
          assessor.assessPlanningPath({
            planningPath: intent,
            snapshotPath: { _tag: "file", path, contents: manifest },
          }),
        ).toEqual({ classification: "unchanged", conflicts: [] });
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "reports differing publishing values and preserves unrelated metadata when composed",
    () =>
      Effect.gen(function* () {
        const assessor = yield* PlanAssessor;
        const composer = yield* JsonComposer;
        const intent = yield* compile(publishing);
        const contents = json({
          name: "@acme/library",
          description: "Keep this",
          private: true,
          files: ["src"],
          dependencies: { effect: "4.0.0" },
        });
        expect(
          assessor.assessPlanningPath({
            planningPath: intent,
            snapshotPath: { _tag: "file", path, contents },
          }).conflicts,
        ).toEqual([
          { _tag: "packageJsonField", path, field: "private" },
          { _tag: "packageJsonField", path, field: "files" },
          { _tag: "packageJsonField", path, field: "dependencies" },
        ]);
        const result = yield* composer.compose(contents, [
          {
            _tag: "json-pkg-fields",
            fileType: "json",
            entries: intent.packageJsonFields,
          },
        ]);
        expect(parseJson(result)).toMatchObject({
          name: "@acme/library",
          description: "Keep this",
          private: false,
        });
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "rejects competing field values and overlapping entry contributions",
    () =>
      Effect.gen(function* () {
        const conflict = yield* Effect.flip(
          compile([
            ...publishing,
            { _tag: "pkg-json-field", path, field: "files", value: ["src"] },
          ]),
        );
        expect(conflict).toBeInstanceOf(PlanFailure);
        const overlap = yield* Effect.flip(
          compile([
            ...publishing,
            {
              _tag: "pkg-json-entry",
              path,
              field: "exports",
              name: ".",
              value: "./src/index.ts",
            },
          ]),
        );
        expect(overlap.message).toContain(
          "Whole-field and entry contributions overlap",
        );
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "accepts equivalent JSON objects and reports malformed manifests",
    () =>
      Effect.gen(function* () {
        const assessor = yield* PlanAssessor;
        const intent = yield* compile([
          {
            _tag: "pkg-json-field",
            path,
            field: "publishConfig",
            value: { access: "public", registry: "https://registry.npmjs.org" },
          },
          {
            _tag: "pkg-json-field",
            path,
            field: "publishConfig",
            value: { registry: "https://registry.npmjs.org", access: "public" },
          },
        ]);
        expect(intent.packageJsonFields).toHaveLength(1);
        expect(
          assessor.assessPlanningPath({
            planningPath: intent,
            snapshotPath: {
              _tag: "file",
              path,
              contents: json({
                publishConfig: {
                  registry: "https://registry.npmjs.org",
                  access: "public",
                },
              }),
            },
          }).classification,
        ).toBe("unchanged");
        expect(
          assessor.assessPlanningPath({
            planningPath: intent,
            snapshotPath: { _tag: "file", path, contents: "invalid json" },
          }).conflicts,
        ).toEqual([{ _tag: "packageJsonField", path, field: "publishConfig" }]);
      }).pipe(Effect.provide(TestLayer)),
  );
});
