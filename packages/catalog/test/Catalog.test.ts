import { assert, it } from "@effect/vitest";
import { CatalogReader, compose } from "@repo/catalog/Catalog";
import {
  type CatalogIssueSubject,
  ModuleCapability,
  ModuleId,
  TargetIdentity,
  TargetKind,
  type ModuleDefinition,
} from "@repo/domain/Catalog";
import { Effect, Result } from "effect";
import { testCatalog } from "./fixtures/testCatalog";

const extraModule: ModuleDefinition = {
  id: ModuleId.make("workspace-extra-example"),
  title: "Extra example",
  description: "A contributed file",
  supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
  dependencies: [],
  contributions: [{ _tag: "file", path: "extra.txt", contents: "extra\n" }],
};

it.effect(
  "should compose an extension while keeping Builder choices specific to each target",
  () => {
    const kind = TargetKind.make("package");
    const api = new TargetIdentity({ kind, name: "api" });
    const sdk = new TargetIdentity({ kind, name: "sdk" });
    const parent: ModuleDefinition = {
      ...extraModule,
      id: ModuleId.make("package-extra"),
      supportedOn: [{ _tag: "kind", kind }],
      children: [
        {
          moduleId: ModuleId.make("package-api-extra"),
          requirement: "optional",
        },
      ],
    };
    const child: ModuleDefinition = {
      ...extraModule,
      id: ModuleId.make("package-api-extra"),
      supportedOn: [{ _tag: "identity", identity: api }],
    };

    return Effect.gen(function* () {
      const reader = yield* CatalogReader;
      const builder = yield* reader.toBuilderCatalog([api, sdk]);

      assert.sameMembers(
        builder.targets.map(({ kind }) => kind),
        testCatalog.targets.map(({ kind }) => kind),
      );
      assert.sameDeepMembers(
        builder.targetModules.map(({ owner, modules }) => ({
          name: owner.name,
          modules: modules.map(({ id }) => String(id)).toSorted(),
          availableChildren: modules
            .find(({ id }) => id === parent.id)
            ?.children.map(({ moduleId }) => moduleId),
        })),
        [
          {
            name: "api",
            modules: [
              "domain-api-contracts",
              "package-api-extra",
              "package-extra",
            ],
            availableChildren: [child.id],
          },
          {
            name: "sdk",
            modules: ["domain-api-contracts", "package-extra"],
            availableChildren: [],
          },
        ],
      );
    }).pipe(
      Effect.provide(
        CatalogReader.fromFragments([
          testCatalog,
          { targets: [], modules: [parent, child] },
        ]),
      ),
    );
  },
);

it.effect(
  "should fail with duplicate-id naming the module when two fragments define the same module ID",
  () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        compose(
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
      assert.strictEqual(failure._tag, "CatalogValidationError");
    }),
);

it.effect(
  "should fail with missing-reference when a module is supported on a target no fragment defines",
  () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        compose([{ targets: [], modules: [extraModule] }]),
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
        compose(
          [testCatalog, { targets: [testCatalog.targets[0]], modules: [] }],
          { trustedFragmentIndex: 0 },
        ),
      );
      assert.strictEqual(failure.details[0]?.code, "duplicate-id");
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
      const invalid: ModuleDefinition = {
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
        compose([testCatalog, { targets: [], modules: [invalid] }], {
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
      const packageKind = TargetKind.make("package");
      const compatibleTarget = new TargetIdentity({
        kind: packageKind,
        name: "domain",
      });
      const workspaceTarget = new TargetIdentity({
        kind: TargetKind.make("workspace"),
        name: "root",
      });
      const requiredId = ModuleId.make("domain-api-contracts");
      const peerId = ModuleId.make("workspace-api-docs");
      const fragment = {
        ...testCatalog,
        modules: testCatalog.modules.map((module): ModuleDefinition =>
          module.id === requiredId
            ? {
                ...module,
                supportedOn: [
                  ...module.supportedOn,
                  {
                    _tag: "identity",
                    identity: new TargetIdentity({
                      kind: packageKind,
                      name: "sdk",
                    }),
                  },
                ],
              }
            : module,
        ),
      };
      const compatible: ModuleDefinition = {
        ...extraModule,
        dependencies: [
          { _tag: "required-target", identity: compatibleTarget },
          {
            _tag: "required-module",
            target: compatibleTarget,
            moduleId: requiredId,
          },
        ],
      };
      yield* compose([fragment, { targets: [], modules: [compatible] }]);

      const invalid: ModuleDefinition = {
        ...compatible,
        dependencies: [
          {
            _tag: "required-module",
            target: workspaceTarget,
            moduleId: requiredId,
          },
        ],
        conflictsWith: [peerId],
      };
      const failure = yield* Effect.flip(
        compose([fragment, { targets: [], modules: [invalid] }]),
      );
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

type ScriptedSubject = {
  readonly subject: CatalogIssueSubject;
  readonly label: string;
  /** The scripted fragment first, then a fragment that completes the catalog. */
  readonly fragments: readonly [unknown, unknown];
  readonly scriptCount: (
    catalog: Effect.Success<ReturnType<typeof compose>>,
  ) => number | undefined;
};

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
      const result = yield* Effect.result(compose(scripted.fragments, options));
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
  "should expose only referenceable providers and reject cross-source conflicts",
  () =>
    Effect.gen(function* () {
      const target = new TargetIdentity({
        kind: TargetKind.make("workspace"),
        name: "root",
      });
      const capability = ModuleCapability.make("example");
      const provider = (id: string): ModuleDefinition => ({
        ...extraModule,
        id: ModuleId.make(id),
        provides: [capability],
      });
      const officialProvider = provider("official-example");
      const localProvider = provider("local-example");
      const unrelatedProvider = provider("unrelated-example");
      const requester: ModuleDefinition = {
        ...extraModule,
        dependencies: [{ _tag: "required-capability", target, capability }],
      };
      const official = {
        ...testCatalog,
        modules: [...testCatalog.modules, officialProvider],
      };
      const unrelated = { targets: [], modules: [unrelatedProvider] };
      const sources = [
        { name: "official", requires: [] },
        { name: "ext", requires: ["official"] },
        { name: "unrelated", requires: ["official"] },
      ];
      const extension = { targets: [], modules: [requester, localProvider] };
      const fragments = [official, extension, unrelated];
      for (const [required, code] of [
        ["absent", "missing-source"],
        ["ext", "invalid-shape"],
      ] as const) {
        const invalidSources = sources.map((source) =>
          source.name === "ext"
            ? { ...source, requires: [...source.requires, required] }
            : source,
        );
        const error = yield* Effect.flip(
          compose(fragments, { sources: invalidSources }),
        );

        assert.deepStrictEqual(
          error.details.map(({ subject, code, fragment }) => ({
            subject,
            code,
            fragment,
          })),
          [{ subject: { _tag: "document" }, code, fragment: 1 }],
        );
      }

      const providers = yield* Effect.gen(function* () {
        const reader = yield* CatalogReader;
        const candidates = { capability, target };
        return {
          unrestricted: reader
            .getCapabilityProviders(candidates)
            .map(({ id }) => id),
          referenceable: reader
            .getCapabilityProviders({
              ...candidates,
              requestingModuleId: requester.id,
            })
            .map(({ id }) => id),
        };
      }).pipe(
        Effect.provide(
          CatalogReader.fromFragments(fragments, {
            sources,
          }),
        ),
      );

      assert.sameMembers(providers.unrestricted, [
        officialProvider.id,
        localProvider.id,
        unrelatedProvider.id,
      ]);
      assert.sameMembers(providers.referenceable, [
        officialProvider.id,
        localProvider.id,
      ]);

      const unavailable = yield* Effect.flip(
        compose(
          [testCatalog, { ...extension, modules: [requester] }, unrelated],
          { sources },
        ),
      );
      assert.deepStrictEqual(
        unavailable.details.map(({ code, fragment, subject }) => ({
          code,
          fragment,
          subject,
        })),
        [
          {
            code: "unavailable-capability",
            fragment: 1,
            subject: { _tag: "module", id: requester.id },
          },
        ],
      );

      const failure = yield* Effect.flip(
        compose(
          [
            official,
            {
              ...extension,
              modules: [
                { ...requester, conflictsWith: [officialProvider.id] },
                localProvider,
              ],
            },
            unrelated,
          ],
          { sources, allowFinalizeScripts: true },
        ),
      );
      assert.deepStrictEqual(
        failure.details.map(({ code, fragment, subject }) => ({
          code,
          fragment,
          subject,
        })),
        [
          {
            code: "cross-source-conflict",
            fragment: 1,
            subject: { _tag: "module", id: requester.id },
          },
        ],
      );
    }),
);
