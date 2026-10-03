import { assert, it } from "@effect/vitest";
import {
  type CatalogIssueSubject,
  ModuleCapability,
  ModuleId,
  TargetIdentity,
  TargetKind,
  type ModuleDefinition,
} from "@repo/domain/Catalog";
import { Effect, Result } from "effect";
import { composeCatalog } from "./composeCatalog";
import { testCatalog } from "./testCatalog";

const extraModule: typeof ModuleDefinition.Type = {
  id: ModuleId.make("workspace-extra-example"),
  title: "Extra example",
  description: "A contributed file",
  supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
  dependencies: [],
  contributions: [{ _tag: "file", path: "extra.txt", contents: "extra\n" }],
};

it.effect(
  "rejects kind-wide placement but retains exact package placement",
  () =>
    Effect.gen(function* () {
      const base = testCatalog.modules.find(
        (module) => module.id === "domain-api-contracts",
      );
      assert.isDefined(base);
      const placement = { ...base, targetPath: "packages/sdk/client" };
      const failure = yield* Effect.flip(
        composeCatalog([
          {
            ...testCatalog,
            modules: [
              placement,
              ...testCatalog.modules.filter(
                (module) => module.id !== placement.id,
              ),
            ],
          },
        ]),
      );
      assert.match(failure.message, /only exact package identities/);
      const exact = {
        ...placement,
        supportedOn: [
          {
            _tag: "identity" as const,
            identity: new TargetIdentity({
              kind: TargetKind.make("package"),
              name: "sdk-client",
            }),
          },
        ],
      };
      const composed = yield* composeCatalog([
        testCatalog,
        {
          targets: [],
          modules: [{ ...exact, id: ModuleId.make("sdk-client-placement") }],
        },
      ]);
      assert.strictEqual(
        composed.modules.at(-1)?.targetPath,
        "packages/sdk/client",
      );
    }),
);

it.effect(
  "should compose a module against another fragment's target when the fragments are independent",
  () =>
    Effect.gen(function* () {
      const catalog = yield* composeCatalog(
        [testCatalog, { targets: [], modules: [extraModule] }],
        { trustedFragmentIndex: 0 },
      );
      assert.strictEqual(catalog.modules.at(-1)?.id, extraModule.id);
      assert.strictEqual(catalog.targets.length, testCatalog.targets.length);
    }),
);

it.effect(
  "should fail with duplicate-id naming the module when two fragments define the same module ID",
  () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        composeCatalog(
          [testCatalog, { targets: [], modules: [testCatalog.modules[0]] }],
          {
            trustedFragmentIndex: 0,
          },
        ),
      );
      assert.deepStrictEqual(
        failure.details.map(({ subject, code }) => ({ subject, code })),
        [
          {
            subject: { _tag: "module", id: "workspace-quality-oxlint" },
            code: "duplicate-id",
          },
        ],
      );
      assert.match(failure.message, /Duplicate module ID/);
    }),
);

it.effect(
  "should fail with missing-reference when a module is supported on a target no fragment defines",
  () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        composeCatalog([{ targets: [], modules: [extraModule] }]),
      );
      assert.match(failure.message, /missing target workspace/);
      assert.deepStrictEqual(failure.details[0]?.subject, {
        _tag: "module",
        id: "workspace-extra-example",
      });
      assert.strictEqual(failure.details[0]?.code, "missing-reference");
    }),
);

it.effect(
  "should fail naming the target when two fragments define the same target kind",
  () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        composeCatalog(
          [testCatalog, { targets: [testCatalog.targets[0]], modules: [] }],
          { trustedFragmentIndex: 0 },
        ),
      );
      assert.match(failure.message, /Duplicate target kind workspace/);
      assert.deepStrictEqual(failure.details[0]?.subject, {
        _tag: "target",
        kind: "workspace",
      });
    }),
);

it.effect(
  "should name every missing graph reference when a module references absent modules and capabilities",
  () =>
    Effect.gen(function* () {
      const target = new TargetIdentity({
        kind: TargetKind.make("workspace"),
        name: "root",
      });
      const invalid: typeof ModuleDefinition.Type = {
        ...extraModule,
        dependencies: [
          {
            _tag: "required-module",
            target,
            moduleId: ModuleId.make("missing-module"),
          },
          {
            _tag: "required-capability",
            target,
            capability: ModuleCapability.make("missing-capability"),
          },
        ],
        implies: [
          {
            targetKind: TargetKind.make("workspace"),
            moduleId: ModuleId.make("missing-implied"),
          },
        ],
        children: [
          { moduleId: ModuleId.make("missing-child"), requirement: "required" },
        ],
        conflictsWith: [ModuleId.make("missing-conflict")],
      };
      const failure = yield* Effect.flip(
        composeCatalog([testCatalog, { targets: [], modules: [invalid] }], {
          trustedFragmentIndex: 0,
        }),
      );
      for (const missing of [
        "missing-module",
        "missing-capability",
        "missing-implied",
        "missing-child",
        "missing-conflict",
      ]) {
        assert.include(failure.message, missing);
      }
    }),
);

it.effect(
  "should fail with unsupported-target and asymmetric-conflict when a module references the wrong target and conflicts one-sidedly",
  () =>
    Effect.gen(function* () {
      const invalid: typeof ModuleDefinition.Type = {
        ...extraModule,
        dependencies: [
          {
            _tag: "required-module",
            target: new TargetIdentity({
              kind: TargetKind.make("workspace"),
              name: "root",
            }),
            moduleId: ModuleId.make("domain-api-contracts"),
          },
        ],
        conflictsWith: [ModuleId.make("workspace-quality-oxlint")],
      };
      const failure = yield* Effect.flip(
        composeCatalog([testCatalog, { targets: [], modules: [invalid] }], {
          trustedFragmentIndex: 0,
        }),
      );
      assert.include(failure.message, "unsupported target");
      assert.include(failure.message, "asymmetric conflict");
      assert.deepStrictEqual(
        failure.details.map(({ subject, code }) => ({ subject, code })),
        [
          {
            subject: { _tag: "module", id: "workspace-extra-example" },
            code: "unsupported-target",
          },
          {
            subject: { _tag: "module", id: "workspace-extra-example" },
            code: "asymmetric-conflict",
          },
        ],
      );
    }),
);

const script = { label: "run", command: "echo run" };
const [workspaceTarget] = testCatalog.targets.filter(
  (target) => target.kind === "workspace",
);

interface ScriptedSubject {
  readonly subject: CatalogIssueSubject;
  readonly label: string;
  /** The scripted fragment first, then a fragment that completes the catalog. */
  readonly fragments: readonly [unknown, unknown];
  readonly scriptCount: (
    catalog: Effect.Success<ReturnType<typeof composeCatalog>>,
  ) => number | undefined;
}

const scriptedModule: ScriptedSubject = {
  subject: { _tag: "module", id: extraModule.id },
  label: `module ${extraModule.id}`,
  fragments: [
    { targets: [], modules: [{ ...extraModule, scripts: [script] }] },
    { targets: [workspaceTarget], modules: [] },
  ],
  scriptCount: (catalog) =>
    catalog.modules.find((module) => module.id === extraModule.id)?.scripts
      ?.length,
};

const scriptedTarget: ScriptedSubject = {
  subject: { _tag: "target", kind: TargetKind.make("workspace") },
  label: "target workspace",
  fragments: [
    { targets: [{ ...workspaceTarget, scripts: [script] }], modules: [] },
    { targets: [], modules: [] },
  ],
  scriptCount: (catalog) =>
    catalog.targets.find((target) => target.kind === "workspace")?.scripts
      ?.length,
};

const trustCases = [scriptedModule, scriptedTarget].flatMap((scripted) => [
  {
    scripted,
    kind: scripted.subject._tag,
    outcome: "reject",
    trust: "untrusted",
    options: {},
  },
  {
    scripted,
    kind: scripted.subject._tag,
    outcome: "reject",
    trust: "not the trusted index",
    options: { trustedFragmentIndex: 1 },
  },
  {
    scripted,
    kind: scripted.subject._tag,
    outcome: "accept",
    trust: "the trusted index",
    options: { trustedFragmentIndex: 0 },
  },
]);

it.effect.each(trustCases)(
  "should $outcome Finalize scripts on a $kind when its fragment is $trust",
  ({ scripted, outcome, options }) =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        composeCatalog(scripted.fragments, options),
      );
      assert.deepStrictEqual(
        Result.match(result, {
          onSuccess: (catalog) => ({ scripts: scripted.scriptCount(catalog) }),
          onFailure: (failure) => ({
            issues: failure.details
              .filter((issue) => issue.code === "finalize-script")
              .map(({ subject, fragment, message }) => ({
                subject,
                fragment,
                message,
              })),
          }),
        }),
        outcome === "accept"
          ? { scripts: 1 }
          : {
              issues: [
                {
                  subject: scripted.subject,
                  fragment: 0,
                  message: `Fragment 0 ${scripted.label} contains Finalize scripts`,
                },
              ],
            },
      );
    }),
);

it.effect(
  "should fail with cross-source-conflict when a module conflicts with a module from another source",
  () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        composeCatalog(
          [
            { targets: testCatalog.targets, modules: testCatalog.modules },
            {
              targets: [],
              modules: [
                {
                  ...extraModule,
                  conflictsWith: [testCatalog.modules[0]!.id],
                },
              ],
            },
          ],
          {
            allowFinalizeScripts: true,
            sources: [
              { name: "official", requires: [] },
              { name: "ext", requires: ["official"] },
            ],
          },
        ),
      );
      assert.deepStrictEqual(
        failure.details.map(({ code, fragment }) => ({ code, fragment })),
        [{ code: "cross-source-conflict", fragment: 1 }],
      );
    }),
);
