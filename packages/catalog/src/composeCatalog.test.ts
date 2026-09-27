import { assert, it } from "@effect/vitest";
import {
  ModuleCapability,
  ModuleId,
  TargetIdentity,
  TargetKind,
  type ModuleDefinition,
} from "@repo/domain/Catalog";
import { Effect } from "effect";
import { bundledCatalog } from "./authoring";
import { composeCatalog } from "./composeCatalog";

const extraModule: typeof ModuleDefinition.Type = {
  id: ModuleId.make("workspace-extra-example"),
  title: "Extra example",
  description: "A contributed file",
  supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
  dependencies: [],
  contributions: [{ _tag: "file", path: "extra.txt", contents: "extra\n" }],
};

it.effect("composes an independent module against an official target", () =>
  Effect.gen(function* () {
    const catalog = yield* composeCatalog(
      [bundledCatalog, { targets: [], modules: [extraModule] }],
      { trustedFragmentIndex: 0 },
    );
    assert.strictEqual(catalog.modules.at(-1)?.id, extraModule.id);
    assert.strictEqual(catalog.targets.length, bundledCatalog.targets.length);
  }),
);

it.effect(
  "rejects duplicate identifiers before lookup indexes can overwrite them",
  () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        composeCatalog(
          [
            bundledCatalog,
            { targets: [], modules: [bundledCatalog.modules[0]] },
          ],
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
    }),
);

it.effect("rejects duplicate target kinds", () =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(
      composeCatalog(
        [bundledCatalog, { targets: [bundledCatalog.targets[0]], modules: [] }],
        { trustedFragmentIndex: 0 },
      ),
    );
    assert.match(failure.message, /Duplicate target kind workspace/);
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
      composeCatalog([bundledCatalog, { targets: [], modules: [invalid] }], {
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
        composeCatalog([bundledCatalog, { targets: [], modules: [invalid] }], {
          trustedFragmentIndex: 0,
        }),
      );
      assert.include(failure.message, "unsupported target");
      assert.include(failure.message, "asymmetric conflict");
    }),
);

it.effect("does not allow an untrusted fragment to add Finalize scripts", () =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(
      composeCatalog(
        [
          bundledCatalog,
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
    assert.match(failure.message, /Finalize scripts/);
  }),
);
