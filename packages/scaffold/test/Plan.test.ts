import { assert, describe, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { CatalogReader } from "@repo/catalog/Catalog";
import type { Contribution } from "@repo/domain/Catalog";
import { type Plan, type PlanOutcome, RepositoryPath } from "@repo/domain/Plan";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { ContributionResolver } from "@repo/scaffold/Plan";
import { Effect, FileSystem, Layer, Schema } from "effect";
import {
  app,
  apply,
  config,
  module,
  pipelineLayer,
  plan,
  readFile,
  repositoryRoot,
  selected,
  selection,
  target,
  testPipeline,
  withFault,
  writeFiles,
} from "./fixtures/scaffold";

describe("ContributionResolver", () => {
  const catalog = CatalogReader.fromFragments([
    {
      targets: [
        target("workspace", {
          contributions: [
            { _tag: "file", path: " {{targetPath}} ", contents: "omit me" },
            {
              _tag: "file",
              path: " {{targetPath}}/root.txt  ",
              contents: "root",
            },
          ],
        }),
        target("package"),
      ],
      modules: [
        module("marker", "package", {
          contributions: [
            {
              _tag: "file",
              path: "{{targetPath}}/marker.txt",
              contents: "{{targetName}}",
            },
            {
              _tag: "pkg-json-entry",
              path: "{{targetPath}}/package.json",
              field: "scripts",
              name: " check ",
              value: "bun test",
            },
          ],
        }),
      ],
    },
  ]);
  const layer = Layer.mergeAll(
    BlueprintResolver.layer,
    ContributionResolver.layer,
  ).pipe(Layer.provide(catalog));

  it.effect(
    "should resolve paths in the owning target and omit empty file paths",
    () =>
      Effect.gen(function* () {
        const blueprints = yield* BlueprintResolver;
        const resolver = yield* ContributionResolver;
        const workspace = selected("workspace", "demo");
        const library = selected("package", "tools/parser", "marker");
        const blueprint = yield* blueprints.resolve(
          selection(workspace, library),
          config,
        );
        const result = yield* resolver.resolve(blueprint, config);

        assert.deepStrictEqual(
          result.targets.map(({ targetKey, contributions }) => ({
            targetKey,
            paths: contributions.map(({ path }) => path),
          })),
          [
            { targetKey: workspace.identity.toKey(), paths: ["root.txt"] },
            { targetKey: library.identity.toKey(), paths: [] },
          ],
        );
        assert.lengthOf(result.modules, 1);
        const [attached] = result.modules;
        assert.equal(attached?.targetKey, library.identity.toKey());
        assert.equal(attached?.moduleId, "marker");
        assert.lengthOf(attached?.contributions ?? [], 2);
        assert.include(
          attached?.contributions.find(({ _tag }) => _tag === "file"),
          {
            path: "packages/tools/parser/marker.txt",
            contents: "tools/parser",
          },
        );
        assert.include(
          attached?.contributions.find(({ _tag }) => _tag === "pkg-json-entry"),
          {
            path: "packages/tools/parser/package.json",
            field: "scripts",
            name: "check",
            value: "bun test",
          },
        );
      }).pipe(Effect.provide(layer)),
  );
});

describe("Planner", () => {
  const officialLayer = pipelineLayer(OfficialCatalogLayer);

  const outcomeAt = (planned: Plan, path: string): PlanOutcome => {
    const outcome = planned.outcomes.find(
      (candidate) => candidate.path === path,
    );
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

  const domain = selection(
    selected("package", "domain", "domain-api-contracts"),
  );

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
      "should add the selected presence route to a new server entry point",
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

          const entryPoint = "apps/server-api/src/index.ts";
          assert.strictEqual(
            outcomeAt(planned, entryPoint).classification,
            "create",
          );

          yield* apply(planned);
          const written = yield* readFile(entryPoint);
          assert.match(
            written,
            /import\s*\{[^}]*\bPresenceRpcRoutes\b[^}]*\}\s*from ["']\.\/rpc\/Presence["']/,
          );
          assert.match(
            written,
            /AllRouters\s*=\s*Layer\.mergeAll\([^)]*\bPresenceRpcRoutes\b/,
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
          assert.deepInclude(conflictsAt(planned, path), {
            ...conflict,
            path,
          });
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

        assert.strictEqual(failure._tag, "PlanError");
        assert.include(failure.message, "packages/domain/");
      }).pipe(Effect.provide(officialLayer)),
    );
  });

  describe("when contributions share a path", () => {
    const manifest = "packages/app/package.json";
    const artifact = "packages/app/src/main.ts";
    const manifestEntry = (
      field: "exports" | "dependencies" | "devDependencies" | "scripts",
      name: string,
      value: string,
    ): Contribution => ({
      _tag: "pkg-json-entry",
      path: manifest,
      field,
      name,
      value,
    });
    const file = (
      contents: string,
      conflictOnModify = false,
    ): Contribution => ({
      _tag: "file",
      path: artifact,
      contents,
      conflictOnModify,
    });
    const call: Contribution = {
      _tag: "ts-call-arg",
      path: artifact,
      targetVariable: "program",
      functionName: "Command.withSubcommands",
      argument: "apiCommand",
      import: { moduleSpecifier: "./api", namedImports: ["apiCommand"] },
    };
    const slot: Contribution = {
      _tag: "jsx-slot",
      path: artifact,
      slotId: "commands",
      content: "<Command />",
    };
    const layerFor = (
      base: ReadonlyArray<Contribution>,
      extra: ReadonlyArray<Contribution>,
    ) =>
      pipelineLayer(
        CatalogReader.fromFragments([
          {
            targets: [target("package")],
            modules: [
              module("base", "package", { contributions: base }),
              module("extra", "package", { contributions: extra }),
            ],
          },
        ]),
      );

    for (const { name, base, extra } of [
      {
        name: "authoritative contents differ",
        base: [file("export const program = 1;\n")],
        extra: [file("export const program = 2;\n")],
      },
      {
        name: "two scripts disagree on one manifest key",
        base: [
          manifestEntry("scripts", "dev", "vite"),
          manifestEntry("scripts", "test", "vitest"),
        ],
        extra: [manifestEntry("scripts", "dev", "node dev.js")],
      },
      {
        name: "two development dependencies disagree on one manifest key",
        base: [manifestEntry("devDependencies", "vitest", "^4.0.0")],
        extra: [manifestEntry("devDependencies", "vitest", "^5.0.0")],
      },
      {
        name: "two exports disagree on one manifest key",
        base: [manifestEntry("exports", "./api", "./src/api.ts")],
        extra: [manifestEntry("exports", "./api", "./src/other.ts")],
      },
      {
        name: "call and slot contributions have no common composition",
        base: [call],
        extra: [slot],
      },
      {
        name: "a seeded call composition also receives a slot",
        base: [file("const program = Command.withSubcommands([]);\n"), call],
        extra: [slot],
      },
    ]) {
      it.effect(`should reject contributed intents when ${name}`, () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          yield* plan(app("base"));
          const failure = yield* Effect.flip(plan(app("base", "extra")));

          assert.strictEqual(failure._tag, "PlanError");
        }).pipe(Effect.provide(layerFor(base, extra))),
      );
    }

    it.effect(
      "should retain protection when identical file contributions are combined",
      () =>
        Effect.gen(function* () {
          const existing = "export const program = makeUserProgram();\n";
          yield* writeFiles({ [artifact]: existing });

          const unprotected = yield* plan(app("base"));
          const protectedPlan = yield* plan(app("base", "extra"));

          assert.strictEqual(
            outcomeAt(unprotected, artifact).classification,
            "modify",
          );
          assert.strictEqual(
            outcomeAt(protectedPlan, artifact).classification,
            "conflict",
          );
          assert.lengthOf(conflictsAt(protectedPlan, artifact), 1);
          assert.strictEqual(yield* readFile(artifact), existing);
        }).pipe(
          Effect.provide(
            layerFor(
              [file("export const program = makeProgram();\n")],
              [file("export const program = makeProgram();\n", true)],
            ),
          ),
        ),
    );

    const entries = [
      manifestEntry("exports", "./api", "./src/api.ts"),
      manifestEntry("dependencies", "effect", "^4.0.0"),
      manifestEntry("devDependencies", "vitest", "^5.0.0"),
      manifestEntry("scripts", "test", "vitest run"),
    ];

    it.effect(
      "should merge each manifest entry into its own section and preserve user fields",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({
            [manifest]: JSON.stringify({
              name: "@repo/app",
              private: true,
              dependencies: { existing: "^1.0.0" },
              exports: { "./existing": "./src/existing.ts" },
            }),
          });
          const planned = yield* plan(app("base"));
          assert.strictEqual(
            outcomeAt(planned, manifest).classification,
            "modify",
          );
          assert.deepEqual(conflictsAt(planned, manifest), []);

          yield* apply(planned);
          const written = yield* Schema.decodeEffect(
            Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
          )(yield* readFile(manifest));
          assert.deepEqual(written, {
            name: "@repo/app",
            private: true,
            exports: {
              "./api": "./src/api.ts",
              "./existing": "./src/existing.ts",
            },
            dependencies: { effect: "^4.0.0", existing: "^1.0.0" },
            devDependencies: { vitest: "^5.0.0" },
            scripts: { test: "vitest run" },
          });

          const repeated = yield* plan(app("base"));
          assert.strictEqual(
            outcomeAt(repeated, manifest).classification,
            "unchanged",
          );
        }).pipe(Effect.provide(layerFor(entries, []))),
    );

    for (const { name, existing, conflicts, nested } of [
      {
        name: "the file is invalid JSON",
        existing: "{",
        nested: true,
        conflicts: [
          { _tag: "exports", name: "./api" },
          { _tag: "dependencies", section: "dependencies", name: "effect" },
          { _tag: "dependencies", section: "devDependencies", name: "vitest" },
          { _tag: "scripts", name: "test" },
        ],
      },
      {
        name: "one dependency differs",
        existing: '{"name":"@repo/app","devDependencies":{"vitest":"^4.0.0"}}',
        conflicts: [
          { _tag: "dependencies", section: "devDependencies", name: "vitest" },
        ],
      },
      {
        name: "an export section contains a non-string sibling",
        existing:
          '{"name":"@repo/app","exports":{"./api":"./src/api.ts","./invalid":7}}',
        conflicts: [{ _tag: "exports", name: "./api" }],
      },
    ]) {
      const path = nested ? "packages/app/config/package.json" : manifest;

      it.effect(`should identify manifest conflicts when ${name}`, () =>
        Effect.gen(function* () {
          yield* writeFiles({
            [manifest]: '{"name":"@repo/app"}',
            [path]: existing,
          });
          const planned = yield* plan(app("base"));

          assert.strictEqual(
            outcomeAt(planned, path).classification,
            "conflict",
          );
          assert.sameDeepMembers(
            [...conflictsAt(planned, path)],
            conflicts.map((conflict) => ({ ...conflict, path })),
          );
          assert.strictEqual(yield* readFile(path), existing);
        }).pipe(
          Effect.provide(
            layerFor(
              entries.map((entry) => ({ ...entry, path })),
              [],
            ),
          ),
        ),
      );
    }
  });

  describe("with the test catalog", () => {
    it.effect(
      "should capture a deterministic baseline without serializing user file contents",
      () =>
        Effect.gen(function* () {
          const privateContents = "distinctive local file contents";
          yield* writeFiles({
            "packages/app/src/a.txt": "A\n",
            "packages/app/src/b.txt": privateContents,
          });
          const planned = yield* plan(app("pair", "api"));
          assert.deepStrictEqual(yield* plan(app("pair", "api")), planned);
          const encoded = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.Unknown),
          )(planned);
          assert.notInclude(encoded, privateContents);
          const tags = new Map<string, string>(
            planned.baseline.paths.map((entry) => [entry.path, entry._tag]),
          );

          assert.strictEqual(planned.baseline.root, repositoryRoot);
          assert.strictEqual(tags.get("packages/app/src"), "directory");
          assert.strictEqual(tags.get("packages/app/src/a.txt"), "file");
          assert.strictEqual(tags.get("packages/app/src/b.txt"), "file");
          assert.strictEqual(tags.get("packages/app/src/Api.ts"), "missing");
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
          assert.strictEqual(failure._tag, "PlanError");
          assert.include(failure.message, "packages/app/src/a.txt");
        }).pipe(Effect.provide(testPipeline)),
      );
    }

    it.effect("should fail when a planned file changes during planning", () =>
      Effect.gen(function* () {
        const path = "packages/app/src/a.txt";
        yield* writeFiles({ [path]: "A\n" });
        yield* plan(app("pair"));

        const fileSystem = yield* FileSystem.FileSystem;
        const absolute = `${repositoryRoot}/${path}`;
        const change = yield* withFault({
          method: "readFile",
          path: absolute,
          before: fileSystem.writeFileString(absolute, "User edit\n"),
          skip: 1,
        });
        const failure = yield* Effect.flip(change.provide(plan(app("pair"))));

        assert.strictEqual(failure._tag, "PlanError");
        assert.include(failure.message, path);
        assert.strictEqual(yield* readFile(path), "User edit\n");
      }).pipe(Effect.provide(testPipeline)),
    );

    it.effect("should fail when a planned file path is a directory", () =>
      Effect.gen(function* () {
        yield* writeFiles({ "packages/app/tsconfig.json/keep": "" });

        const failure = yield* Effect.flip(plan(app("tsconfig")));

        assert.strictEqual(failure._tag, "PlanError");
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
