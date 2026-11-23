import { assert, describe, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { type Plan, type PlanOutcome, RepositoryPath } from "@repo/domain/Plan";
import { Effect } from "effect";
import {
  app,
  apply,
  pipelineLayer,
  plan,
  readFile,
  repositoryRoot,
  selected,
  selection,
  withFault,
  writeFiles,
  testPipeline,
} from "./fixtures/scaffold";

const officialLayer = pipelineLayer(OfficialCatalogLayer);

const outcomeAt = (planned: Plan, path: string): PlanOutcome => {
  const outcome = planned.outcomes.find((candidate) => candidate.path === path);
  assert.isDefined(outcome, `Expected a planned outcome for ${path}`);
  return outcome;
};

const conflictsAt = (planned: Plan, path: string): ReadonlyArray<object> =>
  planned.conflicts.filter((conflict) => conflict.path === path);

const operationsAt = (planned: Plan, path: string) => {
  const outcome = outcomeAt(planned, path);
  assert(outcome._tag === "composed", `Expected ${path} to be composed`);
  return outcome.operations;
};

const domain = selection(selected("package", "domain", "domain-api-contracts"));

describe("PlanService", () => {
  describe("with the official catalog", () => {
    it.effect(
      "should create target and dependency files that are missing",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          const planned = yield* plan(
            selection(selected("server", "api", "server-http-api")),
          );

          for (const path of [
            "apps/server-api/src/index.ts",
            "apps/server-api/src/api/Health.ts",
            "packages/domain/src/Api.ts",
          ]) {
            assert.strictEqual(
              outcomeAt(planned, path).classification,
              "create",
            );
          }
        }).pipe(Effect.provide(officialLayer)),
    );

    it.effect(
      "should plan scaffold-owned files completely and shared files as compositions",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          const planned = yield* plan(domain);

          for (const path of [
            "packages/domain/src/Api.ts",
            "packages/domain/tsconfig.json",
          ]) {
            const outcome = outcomeAt(planned, path);
            assert.strictEqual(outcome._tag, "complete");
            assert.strictEqual(outcome.classification, "create");
          }
          const manifest = operationsAt(
            planned,
            "packages/domain/package.json",
          );
          assert.deepInclude(
            manifest.flatMap((operation) =>
              operation._tag === "json-pkg-exports" ? operation.entries : [],
            ),
            { name: "./Api", value: "./src/Api.ts" },
          );
          assert.deepInclude(
            manifest.flatMap((operation) =>
              operation._tag === "json-pkg-scripts" ? operation.entries : [],
            ),
            { name: "type-check", value: "tsc --noEmit" },
          );
          assert.isFalse(
            planned.outcomes.some(
              (outcome) => outcome.path === "packages/domain/src/index.ts",
            ),
          );
        }).pipe(Effect.provide(officialLayer)),
    );

    it.effect("should plan imports and call arguments a module composes", () =>
      Effect.gen(function* () {
        yield* writeFiles({
          "apps/server-api/src/index.ts":
            'import { Layer } from "effect";\nconst HttpRpcRouter = Layer.empty;\n',
        });
        const planned = yield* plan(
          selection(selected("server", "api", "server-chat-rpc")),
        );

        const operations = operationsAt(
          planned,
          "apps/server-api/src/index.ts",
        );
        assert.isTrue(
          operations.some(
            (operation) =>
              operation._tag === "ts-add-import" &&
              operation.moduleSpecifier === "./rpc/Chat" &&
              operation.namedImports?.includes("ChatRpcRoutes") === true,
          ),
        );
        assert.isTrue(
          operations.some(
            (operation) =>
              operation._tag === "ts-append-call-arg" &&
              operation.targetVariable === "AllRouters" &&
              operation.functionName === "Layer.mergeAll" &&
              operation.argument === "ChatRpcRoutes",
          ),
        );
      }).pipe(Effect.provide(officialLayer)),
    );

    it.effect(
      "should compose into a target file that another selected target creates",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          const planned = yield* plan(
            selection(
              selected("server", "api", "server-ws-presence"),
              selected("package", "domain", "domain-ws-contracts"),
              selected("package", "presence", "package-presence-service"),
            ),
          );

          assert.strictEqual(
            outcomeAt(planned, "apps/server-api/src/index.ts")._tag,
            "composed",
          );
        }).pipe(Effect.provide(officialLayer)),
    );

    for (const { name, path, contents, conflict } of [
      {
        name: "existing manifest exports differ",
        path: "packages/domain/package.json",
        contents:
          '{"name":"@repo/domain","exports":{"./Api":"./src/Other.ts"}}',
        conflict: { _tag: "exports", name: "./Api" },
      },
    ]) {
      it.effect(`should report a conflict when ${name}`, () =>
        Effect.gen(function* () {
          yield* writeFiles({ [path]: contents });
          const planned = yield* plan(domain);

          assert.strictEqual(
            outcomeAt(planned, path).classification,
            "conflict",
          );
          assert.deepInclude(conflictsAt(planned, path), { ...conflict, path });
        }).pipe(Effect.provide(officialLayer)),
      );
    }

    const ai = selection(
      selected(
        "package",
        "ai",
        "package-ai-core",
        "package-ai-toolkit-datetime",
      ),
    );
    const aiIndex = "packages/ai/src/index.ts";

    it.effect(
      "should expose a module's public entry point as a package.json exports subpath",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          const planned = yield* plan(ai);

          assert.deepInclude(
            operationsAt(planned, "packages/ai/package.json").flatMap(
              (operation) =>
                operation._tag === "json-pkg-exports" ? operation.entries : [],
            ),
            {
              name: "./DateTimeToolkit",
              value: "./src/toolkits/DateTimeToolkit.ts",
            },
          );
          assert.isFalse(
            planned.outcomes.some((outcome) => outcome.path === aiIndex),
          );
        }).pipe(Effect.provide(officialLayer)),
    );

    it.effect(
      "should leave a composed src/index.ts from an earlier scaffold untouched",
      () =>
        Effect.gen(function* () {
          const existing =
            'export * from "./LanguageModel";\nexport * from "./toolkits/DateTimeToolkit";\n';
          yield* writeFiles({ [aiIndex]: existing });
          const planned = yield* plan(ai);

          assert.isFalse(
            planned.outcomes.some((outcome) => outcome.path === aiIndex),
          );
          assert.deepStrictEqual(conflictsAt(planned, aiIndex), []);
          yield* apply(planned);
          assert.strictEqual(yield* readFile(aiIndex), existing);
        }).pipe(Effect.provide(officialLayer)),
    );

    it.effect("should fail when an ancestor path is a file", () =>
      Effect.gen(function* () {
        yield* writeFiles({ "packages/domain": "not a directory" });

        const failure = yield* Effect.flip(plan(domain));

        assert.strictEqual(failure._tag, "PlanFailure");
        assert.include(failure.message, "packages/domain/");
      }).pipe(Effect.provide(officialLayer)),
    );
  });

  describe("with the test catalog", () => {
    it.effect(
      "should record missing, directory, and file paths in the baseline",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({ "packages/app/src/a.txt": "A\n" });
          const planned = yield* plan(app("pair"));
          const tags = new Map<string, string>(
            planned.baseline.paths.map((entry) => [entry.path, entry._tag]),
          );

          assert.strictEqual(planned.baseline.root, repositoryRoot);
          assert.strictEqual(tags.get("packages/app/src"), "directory");
          assert.strictEqual(tags.get("packages/app/src/a.txt"), "file");
          assert.strictEqual(tags.get("packages/app/src/b.txt"), "missing");
          assert.strictEqual(
            outcomeAt(planned, "packages/app/src/a.txt").classification,
            "unchanged",
          );
        }).pipe(Effect.provide(testPipeline)),
    );

    for (const method of ["lstat", "readFile"] as const) {
      it.effect(`should fail when ${method} fails for a planned path`, () =>
        Effect.gen(function* () {
          yield* writeFiles({ "packages/app/src/a.txt": "A\n" });
          const fault = yield* withFault({
            method,
            path: `${repositoryRoot}/packages/app/src/a.txt`,
          });

          const failure = yield* Effect.flip(fault.provide(plan(app("pair"))));

          assert.isTrue(yield* fault.fired);
          assert.strictEqual(failure._tag, "PlanFailure");
          assert.include(failure.message, "packages/app/src/a.txt");
        }).pipe(Effect.provide(testPipeline)),
      );
    }

    it.effect("should fail when a planned file path is a directory", () =>
      Effect.gen(function* () {
        yield* writeFiles({ "packages/app/tsconfig.json/keep": "" });

        const failure = yield* Effect.flip(plan(app("tsconfig")));

        assert.strictEqual(failure._tag, "PlanFailure");
        assert.include(failure.message, "packages/app/tsconfig.json");
      }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should report a conflict instead of modifying a protected file",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({ "packages/app/tsconfig.json": "{}\n" });
          const planned = yield* plan(app("tsconfig"));

          assert.deepStrictEqual(planned.conflicts, [
            {
              _tag: "tsconfig",
              path: RepositoryPath.make("packages/app/tsconfig.json"),
            },
          ]);
        }).pipe(Effect.provide(testPipeline)),
    );

    const appFile = "packages/app/src/App.tsx";
    const slotted =
      "export const App = () => <>\n{/* @slot:components */}\n</>;\n";
    const missingSlot = [
      { _tag: "jsxSlotTargetNotFound", path: appFile, slotId: "components" },
    ];
    for (const { name, modules, existing, classification, conflicts } of [
      {
        name: "slot content into an existing marker",
        modules: ["card-slot"],
        existing: slotted,
        classification: "modify",
        conflicts: [],
      },
      {
        name: "slot content into a missing file",
        modules: ["card-slot"],
        existing: undefined,
        classification: "conflict",
        conflicts: missingSlot,
      },
      {
        name: "slot content into a file without the marker",
        modules: ["card-slot"],
        existing: "export const App = () => <></>;\n",
        classification: "conflict",
        conflicts: missingSlot,
      },
      {
        name: "slot content beside marker text outside JSX",
        modules: ["card-slot"],
        existing:
          'const misleading = "{/* @slot:components */}";\nexport const App = () => <main />;\n',
        classification: "conflict",
        conflicts: missingSlot,
      },
      {
        name: "a written file with its slot content",
        modules: ["app-shell", "card-slot"],
        existing: undefined,
        classification: "create",
        conflicts: [],
      },
      {
        name: "a written file over one without the marker",
        modules: ["app-shell", "card-slot"],
        existing: "export const App = () => <></>;\n",
        classification: "conflict",
        conflicts: missingSlot,
      },
    ] as const) {
      it.effect(`should plan ${name} as ${classification}`, () =>
        Effect.gen(function* () {
          yield* writeFiles(
            existing === undefined ? {} : { [appFile]: existing },
          );
          const planned = yield* plan(app(...modules));

          assert.strictEqual(
            outcomeAt(planned, appFile).classification,
            classification,
          );
          assert.deepStrictEqual(conflictsAt(planned, appFile), conflicts);
        }).pipe(Effect.provide(testPipeline)),
      );
    }

    const manifest = "packages/app/package.json";
    const generatedDev =
      "deno run --allow-env --allow-net --allow-read --allow-write src/index.ts";

    it.effect(
      "should keep a generated Deno FFI grant while merging an unrelated dependency",
      () =>
        Effect.gen(function* () {
          const withFfi = generatedDev.replace(
            "--allow-write",
            "--allow-write --allow-ffi",
          );
          yield* writeFiles({
            [manifest]: JSON.stringify({
              name: "@repo/app",
              scripts: { dev: withFfi },
            }),
          });
          const planned = yield* plan(app("deno-dev", "db-dependency"));

          assert.strictEqual(
            outcomeAt(planned, manifest).classification,
            "modify",
          );
          assert.deepStrictEqual(planned.conflicts, []);
          yield* apply(planned);
          const written = yield* readFile(manifest);
          assert.include(written, withFfi);
          assert.include(written, '"@repo/db": "workspace:*"');
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should report a conflict for a custom script with the same name",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({
            [manifest]: JSON.stringify({
              name: "@repo/app",
              scripts: { dev: "deno run --allow-ffi custom.ts" },
            }),
          });
          const planned = yield* plan(app("deno-dev", "db-dependency"));

          assert.deepStrictEqual(planned.conflicts, [
            {
              _tag: "scripts",
              path: RepositoryPath.make(manifest),
              name: "dev",
            },
          ]);
        }).pipe(Effect.provide(testPipeline)),
    );

    for (const [path, previous] of [
      ["deno.json", '{"workspace":[],"custom":"old"}'],
      ["pnpm-workspace.yaml", "packages: []\nsetting: old\n"],
    ] as const) {
      it.effect(
        `should register members in the proposed ${path} when it conflicts`,
        () =>
          Effect.gen(function* () {
            yield* writeFiles({ [path]: previous });
            const planned = yield* plan(
              selection(
                selected("workspace", "test-project"),
                selected("package", "app", "manifest"),
              ),
            );

            const outcome = outcomeAt(planned, path);
            assert(outcome._tag === "complete");
            assert.strictEqual(outcome.classification, "conflict");
            assert.include(outcome.contents, "packages/app");
            assert.include(outcome.contents, "new");
            assert.notInclude(outcome.contents, "old");
          }).pipe(Effect.provide(testPipeline)),
      );
    }
  });
});
