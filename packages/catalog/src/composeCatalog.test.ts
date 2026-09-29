import { assert, it } from "@effect/vitest";
import {
  ModuleCapability,
  ModuleId,
  TargetIdentity,
  TargetKind,
  type ModuleDefinition,
} from "@repo/domain/Catalog";
import { Effect } from "effect";
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
  "composes an independent module against another fragment's target",
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
  "rejects duplicate identifiers before lookup indexes can overwrite them",
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
      assert.match(failure.message, /Duplicate module ID/);
    }),
);

it.effect(
  "validates references after composition and rejects missing targets",
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

it.effect("rejects duplicate target kinds", () =>
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

it.effect("rejects broken graph references before constructing a service", () =>
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
  "rejects references to modules on the wrong target and one-sided conflicts",
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

it.effect("does not allow an untrusted fragment to add Finalize scripts", () =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(
      composeCatalog(
        [
          testCatalog,
          {
            targets: [],
            modules: [
              {
                ...extraModule,
                scripts: [{ label: "run", command: "echo run" }],
              },
            ],
          },
        ],
        { trustedFragmentIndex: 0 },
      ),
    );
    assert.include(
      failure.issues,
      "Fragment 1 module workspace-extra-example contains Finalize scripts",
    );
    assert.deepStrictEqual(
      failure.details.map(({ subject, code, fragment }) => ({
        subject,
        code,
        fragment,
      })),
      [
        {
          subject: { _tag: "module", id: "workspace-extra-example" },
          code: "finalize-script",
          fragment: 1,
        },
      ],
    );
  }),
);

it.effect("trusts Finalize scripts only in the named fragment", () =>
  Effect.gen(function* () {
    const scripted = {
      targets: [],
      modules: [
        { ...extraModule, scripts: [{ label: "run", command: "echo run" }] },
      ],
    };
    const workspace = {
      targets: testCatalog.targets.filter(
        (target) => target.kind === "workspace",
      ),
      modules: [],
    };
    for (const options of [{}, { trustedFragmentIndex: 1 }]) {
      const failure = yield* Effect.flip(
        composeCatalog([scripted, workspace], options),
      );
      assert.include(
        failure.issues,
        "Fragment 0 module workspace-extra-example contains Finalize scripts",
      );
    }
    const trusted = yield* composeCatalog([scripted, workspace], {
      trustedFragmentIndex: 0,
    });
    assert.strictEqual(trusted.modules[0]?.scripts?.length, 1);
  }),
);

it.effect("names a target that ships untrusted Finalize scripts", () =>
  Effect.gen(function* () {
    const [workspace] = testCatalog.targets.filter(
      (target) => target.kind === "workspace",
    );
    assert.isDefined(workspace);
    const failure = yield* Effect.flip(
      composeCatalog([
        {
          targets: [
            { ...workspace, scripts: [{ label: "run", command: "echo run" }] },
          ],
          modules: [],
        },
      ]),
    );
    assert.deepStrictEqual(
      failure.details
        .filter((issue) => issue.code === "finalize-script")
        .map(({ subject, message }) => ({ subject, message })),
      [
        {
          subject: { _tag: "target", kind: "workspace" },
          message: "Fragment 0 target workspace contains Finalize scripts",
        },
      ],
    );
  }),
);

it.effect("keeps conflicts within one named source", () =>
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
