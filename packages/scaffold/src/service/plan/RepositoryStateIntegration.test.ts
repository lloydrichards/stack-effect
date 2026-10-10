import assert from "node:assert/strict";
import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import {
  OfficialCatalogLayer,
  officialCatalogLayerWith,
} from "@repo/catalog-official/service";
import { Apply, StalePlanFailure } from "@repo/domain/Apply";
import {
  Blueprint,
  BlueprintTargetNode,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { Plan } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, FileSystem, Layer, Path, PlatformError, Schema } from "effect";
import { ApplyPreviewService } from "../apply/ApplyPreviewService";
import { ApplyService } from "../apply/ApplyService";
import { ApplyWorkspaceService } from "../apply/ApplyWorkspaceService";
import { BlueprintService } from "../blueprint/BlueprintService";
import { PlanService } from "./PlanService";
import { RepositoryStateService } from "./RepositoryStateService";

const repoRoot = "/repo";
const target = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "domain",
});
const moduleId = ModuleId.make("domain-api-contracts");
const moduleNodeId = toAttachedModuleNodeId(target.toKey(), moduleId);
const blueprint = new Blueprint({
  nodes: [
    { _tag: "target", id: target.toKey(), identity: target },
    {
      _tag: "attached-module",
      id: moduleNodeId,
      targetId: target.toKey(),
      moduleId,
    },
  ],
  edges: [
    {
      id: `owns-module=>${target.toKey()}=>${moduleNodeId}`,
      from: target.toKey(),
      to: moduleNodeId,
      reason: "owns-module",
    },
  ],
}).toSorted();
const config = new StackConfig({
  name: "test-project",
  runtime: { _tag: "bun" },
});

const TestLayer = Layer.provideMerge(
  Layer.mergeAll(
    PlanService.layer,
    ApplyService.layer,
    ApplyPreviewService.layer,
    ApplyWorkspaceService.layer,
    RepositoryStateService.layer,
  ),
  Layer.mergeAll(
    Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
    Path.layer,
    OfficialCatalogLayer,
  ),
);

const buildAt = (root: string) =>
  Effect.gen(function* () {
    const plans = yield* PlanService;
    return yield* plans.build({ blueprint, repoRoot: root, config });
  });
const build = buildAt(repoRoot);

const intent = (plan: Plan) => new Apply({ plan, decisions: [] });

const writeManifest = (directory: string, contents: string) =>
  Effect.gen(function* () {
    const files = yield* FileSystem.FileSystem;
    const absolute = `${repoRoot}/${directory}`;
    yield* files.makeDirectory(absolute, { recursive: true });
    yield* files.writeFileString(`${absolute}/package.json`, contents);
  });
const ownerManifest = (directory: string, name: string) =>
  writeManifest(directory, JSON.stringify({ name }));
const packageNode = (name: string): typeof BlueprintTargetNode.Type => {
  const identity = new TargetIdentity({
    kind: TargetKind.make("package"),
    name,
  });
  return {
    _tag: "target",
    id: identity.toKey(),
    identity,
  };
};
const targetBlueprint = (
  nodes: ReadonlyArray<typeof BlueprintTargetNode.Type>,
) => new Blueprint({ nodes, edges: [] }).toSorted();
const buildProposed = (proposed: Blueprint) =>
  Effect.gen(function* () {
    const plans = yield* PlanService;
    return yield* plans.build({ blueprint: proposed, repoRoot, config });
  });

const nestedServer = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "sdk/api",
});
const nestedServerBlueprint = targetBlueprint([
  { _tag: "target", id: nestedServer.toKey(), identity: nestedServer },
]);

describe("Plan and Apply repository state", () => {
  for (const runtime of [
    { _tag: "deno" },
    { _tag: "node", packageManager: "pnpm" },
  ] as const) {
    it.effect(
      `should preserve ${runtime._tag} workspace settings when nested packages are added incrementally`,
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          yield* ownerManifest("packages/helper", "@repo/helper");
          yield* writeManifest("packages/helper/templates/workspace", "{}");
          yield* files.writeFileString(
            `${repoRoot}/package.json`,
            '{"name":"project","workspaces":["apps/**","packages/**","tools/*"],"scripts":{"custom":"echo custom"}}',
          );
          yield* files.writeFileString(
            `${repoRoot}/deno.json`,
            '{"workspace":["apps/**","packages/**"],"tasks":{"custom":"echo custom"}}',
          );
          yield* files.writeFileString(
            `${repoRoot}/pnpm-workspace.yaml`,
            'packages:\n  - "apps/**"\n  - "packages/**"\n\nallowBuilds:\n  esbuild: true\n',
          );
          const apply = yield* ApplyService;
          const plans = yield* PlanService;
          const configuration = new StackConfig({ name: "project", runtime });
          const workspace = new TargetIdentity({
            kind: TargetKind.make("workspace"),
            name: configuration.name,
          });
          const proposed = (name: string) =>
            targetBlueprint([
              { _tag: "target", identity: workspace, id: workspace.toKey() },
              packageNode(name),
            ]);
          const planAt = (name: string) =>
            plans.build({
              blueprint: proposed(name),
              repoRoot,
              config: configuration,
            });
          for (const name of ["sdk/client", "sdk/codecs"]) {
            const plan = yield* planAt(name);
            expect(plan.conflicts).toEqual([]);
            expect(
              (yield* apply.apply({ apply: intent(plan), repoRoot })).failed,
            ).toEqual([]);
          }
          const members = [
            "packages/config-typescript",
            "packages/helper",
            "packages/sdk/client",
            "packages/sdk/codecs",
          ];
          const manifest = yield* Schema.decodeEffect(
            Schema.fromJsonString(
              Schema.Struct({
                workspaces: Schema.Array(Schema.String),
                scripts: Schema.Record(Schema.String, Schema.String),
              }),
            ),
          )(yield* files.readFileString(`${repoRoot}/package.json`));
          expect(manifest.workspaces).toEqual([...members, "tools/*"]);
          expect(manifest.scripts["custom"]).toBe("echo custom");
          const deno = yield* Schema.decodeEffect(
            Schema.fromJsonString(
              Schema.Struct({
                workspace: Schema.Array(Schema.String),
                tasks: Schema.Record(Schema.String, Schema.String),
              }),
            ),
          )(yield* files.readFileString(`${repoRoot}/deno.json`));
          expect(deno.workspace).toEqual(members);
          expect(deno.tasks["custom"]).toBe("echo custom");
          const pnpm = yield* files.readFileString(
            `${repoRoot}/pnpm-workspace.yaml`,
          );
          expect(pnpm).toBe(
            `packages:\n${members.map((member) => `  - ${member}\n`).join("")}\nallowBuilds:\n  esbuild: true\n`,
          );
          const repeated = yield* planAt("sdk/codecs");
          expect(
            (yield* apply.apply({ apply: intent(repeated), repoRoot })).failed,
          ).toEqual([]);
          expect(
            yield* files.readFileString(`${repoRoot}/pnpm-workspace.yaml`),
          ).toBe(pnpm);
          expect(
            yield* files.readFileString(`${repoRoot}/deno.json`),
          ).toContain('"custom": "echo custom"');
          expect(
            repeated.outcomes
              .filter((outcome) =>
                ["package.json", "deno.json", "pnpm-workspace.yaml"].includes(
                  outcome.path,
                ),
              )
              .every((outcome) => outcome.classification === "unchanged"),
          ).toBe(true);
        }).pipe(Effect.provide(TestLayer)),
    );
  }

  for (const manifest of [
    {
      path: "deno.json",
      previous: '{"workspace":[],"custom":"old"}',
      proposed: '{"workspace":[],"custom":"new"}',
    },
    {
      path: "pnpm-workspace.yaml",
      previous: "packages: []\nsetting: old\n",
      proposed: "packages: []\nsetting: new\n",
    },
  ]) {
    it.effect(
      `should require an Apply decision when ${manifest.path} conflicts while membership changes`,
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          yield* files.makeDirectory(repoRoot, { recursive: true });
          yield* files.writeFileString(
            `${repoRoot}/${manifest.path}`,
            manifest.previous,
          );
          const workspace = new TargetIdentity({
            kind: TargetKind.make("workspace"),
            name: config.name,
          });
          const catalog = CatalogService.fromFragments([
            {
              targets: [
                {
                  kind: "workspace",
                  title: "Workspace",
                  description: "Workspace",
                  contributions: [
                    {
                      _tag: "file",
                      path: manifest.path,
                      contents: manifest.proposed,
                      conflictOnModify: true,
                    },
                  ],
                },
                {
                  kind: "package",
                  title: "Package",
                  description: "Package",
                  contributions: [
                    {
                      _tag: "file",
                      path: "{{targetPath}}/package.json",
                      contents: '{"name":"{{packageName}}"}',
                    },
                  ],
                },
              ],
              modules: [],
            },
          ]);
          const services = Layer.merge(
            PlanService.layer,
            ApplyService.layer,
          ).pipe(
            Layer.provide(catalog),
            Layer.provide(
              Layer.merge(
                Layer.succeed(FileSystem.FileSystem, files),
                Path.layer,
              ),
            ),
          );
          yield* Effect.gen(function* () {
            const plans = yield* PlanService;
            const service = yield* ApplyService;
            const plan = yield* plans.build({
              blueprint: targetBlueprint([
                { _tag: "target", id: workspace.toKey(), identity: workspace },
                packageNode("sdk/client"),
              ]),
              repoRoot,
              config,
            });
            expect(plan.conflicts.map((conflict) => conflict.path)).toEqual([
              manifest.path,
            ]);
            expect(
              plan.outcomes.find((outcome) => outcome.path === manifest.path)
                ?.classification,
            ).toBe("conflict");
            expect(
              (yield* Effect.flip(
                service.apply({ apply: intent(plan), repoRoot }),
              ))._tag,
            ).toBe("ApplyFailure");
            expect(
              yield* files.readFileString(`${repoRoot}/${manifest.path}`),
            ).toBe(manifest.previous);
            const result = yield* service.apply({
              apply: new Apply({
                plan,
                decisions: [{ path: manifest.path, value: "override" }],
              }),
              repoRoot,
            });
            expect(result.failed).toEqual([]);
            const updated = yield* files.readFileString(
              `${repoRoot}/${manifest.path}`,
            );
            expect(updated).toContain("packages/sdk/client");
            expect(updated).toContain("new");
          }).pipe(Effect.provide(Layer.fresh(services)));
        }).pipe(Effect.provide(TestLayer)),
    );
  }

  const ownershipRejections = [
    {
      title: "rejects a helper package owning the parent of a proposed package",
      setup: ownerManifest("packages/domain", "@repo/other"),
      proposed: blueprint,
      message: "packages/domain",
    },
    ...[
      { path: "packages", name: "@repo/sdk" },
      { path: "packages/domain/client", name: "@repo/client" },
      { path: "packages/other", name: "@repo/domain" },
      { path: "packages/Domain", name: "@repo/other" },
    ].map(({ path, name }) => ({
      title: `rejects incompatible existing owner ${name} at ${path}`,
      setup: ownerManifest(path, name),
      proposed: blueprint,
      message: path,
    })),
    {
      title:
        "rejects a case-only npm name collision with an existing app owner",
      setup: ownerManifest("apps/other", "SERVER-SDK-API"),
      proposed: nestedServerBlueprint,
      message: "SERVER-SDK-API",
    },
    {
      title: "rejects an existing app owner enclosing a proposed nested app",
      setup: ownerManifest("apps/sdk", "helper-app"),
      proposed: nestedServerBlueprint,
      message: "apps/sdk",
    },
    {
      title:
        "rejects a legacy flattened app location before nesting its identity",
      setup: ownerManifest("apps/server-sdk-api", "server-sdk-api"),
      proposed: nestedServerBlueprint,
      message: "apps/server-sdk-api",
    },
    {
      title: "rejects an app grouping symlink before any package writes",
      setup: Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(`${repoRoot}/apps`, { recursive: true });
        yield* files.symlink("/missing-group", `${repoRoot}/apps/sdk`);
      }),
      proposed: blueprint,
      message: "apps/sdk",
    },
    {
      title: "rejects overlapping proposed package owners before projection",
      setup: Effect.void,
      proposed: targetBlueprint([
        packageNode("domain"),
        packageNode("domain/client"),
      ]),
      message: "packages/domain/client",
    },
    {
      title:
        "rejects flat and hierarchical names producing the same npm package name",
      setup: Effect.void,
      proposed: targetBlueprint([
        packageNode("sdk-client"),
        packageNode("sdk/client"),
      ]),
      message: "@repo/sdk-client",
    },
    ...["build", "dist"].map((directory) => {
      const ownerRoot = `packages/${directory}/sdk`;
      return {
        title: `rejects an owner under packages/${directory} enclosing a proposed package`,
        setup: ownerManifest(ownerRoot, "@repo/sdk"),
        proposed: targetBlueprint([packageNode(`${directory}/sdk/client`)]),
        message: ownerRoot,
      };
    }),
    {
      title: "rejects a malformed owner manifest without guessing ownership",
      setup: writeManifest("packages/helper", "invalid json"),
      proposed: blueprint,
      message: "packages/helper/package.json",
    },
    {
      title: "rejects symbolic links in package discovery",
      setup: Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(`${repoRoot}/packages`, { recursive: true });
        yield* files.makeDirectory("/foreign", { recursive: true });
        yield* files.symlink("/foreign", `${repoRoot}/packages/helper`);
      }),
      proposed: blueprint,
      message: "packages/helper",
    },
    {
      title: "rejects dangling symbolic links in package discovery",
      setup: Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(`${repoRoot}/packages`, { recursive: true });
        yield* files.symlink("/missing-owner", `${repoRoot}/packages/helper`);
      }),
      proposed: blueprint,
      message: "packages/helper",
    },
    {
      title: "rejects case-variant owner manifest names",
      setup: Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* ownerManifest("packages/domain", "@repo/other");
        yield* files.rename(
          `${repoRoot}/packages/domain/package.json`,
          `${repoRoot}/packages/domain/Package.json`,
        );
      }),
      proposed: blueprint,
      message: "packages/domain/Package.json",
    },
  ];
  ownershipRejections.forEach(({ title, setup, proposed, message }) => {
    it.effect(title, () =>
      Effect.gen(function* () {
        yield* setup;
        const failure = yield* Effect.flip(buildProposed(proposed));
        assert(failure._tag === "PlanFailure");
        expect(failure.message).toContain(message);
        const files = yield* FileSystem.FileSystem;
        expect(
          yield* files.exists(`${repoRoot}/packages/domain/src/Api.ts`),
        ).toBe(false);
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  it.effect(
    "rejects ownership changes before capturing the Plan baseline",
    () =>
      Effect.gen(function* () {
        const files = yield* MemoryFileSystem.make.pipe(
          Effect.provide(BrowserCrypto.layer),
        );
        yield* files.makeDirectory(repoRoot, { recursive: true });
        const wrapped = {
          ...files,
          stat: (path: string) =>
            files
              .stat(path)
              .pipe(
                Effect.tapError(() =>
                  path === `${repoRoot}/packages`
                    ? ownerManifest("packages/domain", "@repo/other").pipe(
                        Effect.provideService(FileSystem.FileSystem, files),
                      )
                    : Effect.void,
                ),
              ),
        };
        const failure = yield* Effect.flip(build).pipe(
          Effect.provide(
            PlanService.layer.pipe(
              Layer.provide(OfficialCatalogLayer),
              Layer.provide(
                Layer.merge(
                  Layer.succeed(FileSystem.FileSystem, wrapped),
                  Path.layer,
                ),
              ),
            ),
          ),
        );
        expect(failure._tag).toBe("PlanFailure");
        assert(failure._tag === "PlanFailure");
        expect(failure.reason).toBe("repoStateChanged");
        expect(
          yield* files.readFileString(
            `${repoRoot}/packages/domain/package.json`,
          ),
        ).toBe('{"name":"@repo/other"}');
      }),
  );

  for (const [existingName, proposedName] of [
    ["domain", "domain/client"],
    ["domain/client", "domain"],
    ["sdk-client", "sdk/client"],
  ] as const) {
    it.effect(
      `rejects incremental reuse of ${existingName} by ${proposedName} without relocating existing files`,
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          const service = yield* ApplyService;
          const initialNode = packageNode(existingName);
          const initial = yield* buildProposed(targetBlueprint([initialNode]));
          yield* service.apply({ apply: intent(initial), repoRoot });
          const manifestPath = `${repoRoot}/${initialNode.identity.toPath()}/package.json`;
          const original = yield* files.readFileString(manifestPath);
          const proposed = targetBlueprint([packageNode(proposedName)]);
          const failure = yield* Effect.flip(buildProposed(proposed));
          expect(failure._tag).toBe("PlanFailure");
          expect(yield* files.readFileString(manifestPath)).toBe(original);
          expect(
            yield* files.exists(
              `${repoRoot}/${packageNode(proposedName).identity.toPath()}/src/index.ts`,
            ),
          ).toBe(false);
        }).pipe(Effect.provide(TestLayer)),
    );
  }

  for (const existingOwner of [false, true]) {
    it.effect(
      existingOwner
        ? "rejects a planned manifest colliding with an existing owner before writes"
        : "rejects duplicate planned manifest names before any writes",
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          yield* files.makeDirectory(repoRoot, { recursive: true });
          if (existingOwner)
            yield* ownerManifest("packages/existing", "@repo/shared");
          const destinations = existingOwner
            ? ["packages/new"]
            : ["packages/new-a", "packages/new-b"];
          const state = yield* RepositoryStateService;
          const baseline = yield* state.capture({
            repoRoot,
            paths: [
              ".",
              "packages",
              ...destinations.flatMap((path) => [path, `${path}/package.json`]),
            ],
          });
          const apply = new Apply({
            plan: new Plan({
              baseline,
              outcomes: destinations.map((path) => ({
                _tag: "complete" as const,
                path: `${path}/package.json`,
                classification: "create" as const,
                contents: '{"name":"@repo/shared"}',
              })),
              conflicts: [],
            }),
            decisions: [],
          });
          const service = yield* ApplyService;
          const failure = yield* Effect.flip(
            service.apply({ apply, repoRoot }),
          );
          assert(failure._tag === "ApplyFailure");
          expect(failure.reason).toBe("invalidApplyIntent");
          expect(failure.message).toContain("@repo/shared");
          yield* Effect.forEach(destinations, (path) =>
            Effect.gen(function* () {
              expect(yield* files.exists(`${repoRoot}/${path}`)).toBe(false);
            }),
          );
          if (existingOwner)
            expect(
              yield* files.readFileString(
                `${repoRoot}/packages/existing/package.json`,
              ),
            ).toBe('{"name":"@repo/shared"}');
        }).pipe(Effect.provide(TestLayer)),
    );
  }

  it.effect(
    "creates two authorized package manifests without self-staleness",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repoRoot, { recursive: true });
        yield* ownerManifest("packages/a/b", "@repo/shared-utils");
        yield* ownerManifest("packages/a-c", "@repo/sdk-codecs");
        const twoPackages = targetBlueprint([
          packageNode("domain"),
          packageNode("sdk"),
        ]);
        const plan = yield* buildProposed(twoPackages);
        const service = yield* ApplyService;
        const result = yield* service.apply({ apply: intent(plan), repoRoot });
        expect(result.created).toContain("packages/domain/package.json");
        expect(result.created).toContain("packages/sdk/package.json");
        expect(
          yield* files.exists(`${repoRoot}/packages/sdk/package.json`),
        ).toBe(true);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "treats existing owner build manifests, fixtures and symlinks as content during unrelated additions",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* ownerManifest("packages/helper", "@repo/helper");
        yield* ownerManifest("packages/helper/dist", "@repo/helper");
        yield* writeManifest("packages/helper/tests/fixtures", "{}");
        yield* files.symlink(
          "/missing-source",
          `${repoRoot}/packages/helper/source-link`,
        );
        const plan = yield* build;
        expect(plan.baseline.packageOwners).toEqual([
          { path: "packages/helper", name: "@repo/helper" },
        ]);
        const service = yield* ApplyService;
        const result = yield* service.apply({ apply: intent(plan), repoRoot });
        expect(result.failed).toEqual([]);
        expect(result.created).toContain("packages/domain/package.json");
      }).pipe(Effect.provide(TestLayer)),
  );

  for (const fixtureDirectory of [".fixtures", "dist"]) {
    for (const contents of ["{}", '{"name":"fixture-owner"}']) {
      it.effect(
        `should complete later writes when an owner contains a ${fixtureDirectory} manifest ${contents}`,
        () =>
          Effect.gen(function* () {
            const files = yield* FileSystem.FileSystem;
            const name = ModuleId.make("domain-fixture-regression");
            const identity = packageNode("domain").identity;
            const fixtureCatalog = officialCatalogLayerWith([
              {
                targets: [],
                modules: [
                  {
                    id: name,
                    title: "Fixture",
                    description: "Fixture",
                    supportedOn: [{ _tag: "identity", identity }],
                    dependencies: [],
                    contributions: [
                      {
                        _tag: "file",
                        path: `{{targetPath}}/${fixtureDirectory}/package.json`,
                        contents,
                      },
                      {
                        _tag: "file",
                        path: "{{targetPath}}/z.txt",
                        contents: "later",
                      },
                    ],
                  },
                ],
              },
            ]);
            const services = Layer.mergeAll(
              BlueprintService.layer,
              PlanService.layer,
              ApplyService.layer,
            ).pipe(
              Layer.provide(fixtureCatalog),
              Layer.provide(
                Layer.merge(
                  Layer.succeed(FileSystem.FileSystem, files),
                  Path.layer,
                ),
              ),
            );
            const result = yield* Effect.gen(function* () {
              const resolver = yield* BlueprintService;
              const fixtureBlueprint = yield* resolver.resolve(
                { targets: [{ identity, modules: [{ id: name }] }] },
                config,
              );
              const plan = yield* buildProposed(fixtureBlueprint);
              const service = yield* ApplyService;
              return yield* service.apply({ apply: intent(plan), repoRoot });
            }).pipe(Effect.provide(Layer.fresh(services)));
            expect(result.failed).toEqual([]);
            expect(
              yield* files.readFileString(`${repoRoot}/packages/domain/z.txt`),
            ).toBe("later");
            expect(
              yield* files.readFileString(
                `${repoRoot}/packages/domain/${fixtureDirectory}/package.json`,
              ),
            ).toBe(contents);
          }).pipe(Effect.provide(TestLayer)),
      );
    }
  }

  it.effect("accepts an unrelated deep unowned directory", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      const deep = `packages/${Array.from({ length: 10 }, (_, index) => `level${index}`).join("/")}`;
      yield* files.makeDirectory(`${repoRoot}/${deep}`, { recursive: true });
      const plan = yield* build;
      expect(plan.baseline.packageOwners).toEqual([]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("ignores synthetic case-variant dependency directories", () =>
    Effect.gen(function* () {
      yield* writeManifest("packages/sdk/NODE_MODULES/shared", "not-json");
      const plan = yield* build;
      expect(plan.baseline.packageOwners).toEqual([]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("accepts an unowned container and same-owner continuation", () =>
    Effect.gen(function* () {
      yield* ownerManifest("packages/domain", "@repo/domain");
      const plan = yield* build;
      expect(plan.baseline.packageOwners).toEqual([
        { path: "packages/domain", name: "@repo/domain" },
      ]);
    }).pipe(Effect.provide(TestLayer)),
  );

  for (const change of ["removed", "renamed", "discovered"] as const) {
    const discovered = change === "discovered";
    const title = discovered
      ? "rejects a newly discovered helper manifest after planning"
      : `rejects a ${change} helper owner after planning`;
    it.effect(title, () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* ownerManifest(
          discovered ? "packages/unrelated" : "packages/helper",
          discovered ? "@repo/unrelated" : "@repo/helper",
        );
        const plan = yield* build;
        const mutation =
          change === "removed"
            ? files.remove(`${repoRoot}/packages/helper/package.json`)
            : ownerManifest(
                "packages/helper",
                discovered ? "@repo/helper" : "@repo/changed",
              );
        yield* mutation;
        const service = yield* ApplyService;
        const failure = yield* Effect.flip(
          service.apply({ apply: intent(plan), repoRoot }),
        );
        expect(failure).toBeInstanceOf(StalePlanFailure);
        assert(failure._tag === "StalePlanFailure");
        expect(failure.partialResult.created).toEqual([]);
      }).pipe(Effect.provide(TestLayer)),
    );
  }
  it.effect(
    "plans and applies real catalog files in one seeded workspace",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repoRoot, { recursive: true });
        const repositoryState = yield* RepositoryStateService;
        const workspaces = yield* ApplyWorkspaceService;
        const baseline = yield* repositoryState.capture({
          repoRoot,
          paths: ["."],
        });
        const workspace = yield* workspaces.create({ repoRoot, baseline });
        const plan = yield* workspace.plan({ blueprint, config });
        const result = yield* workspace.materialize(intent(plan));

        expect(result.apply.created.length).toBeGreaterThan(0);
        expect(result.apply.failed).toEqual([]);
        expect(result.files.map((file) => file.path)).toEqual(
          result.apply.created,
        );
        expect(
          yield* files.exists(`${repoRoot}/${result.apply.created[0]}`),
        ).toBe(false);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("plans and applies beneath a missing repository root", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      const root = "/future/repo";
      const plan = yield* buildAt(root);
      expect(plan.baseline.root).toBe(root);
      const previews = yield* ApplyPreviewService;
      const preview = yield* previews.preview({
        apply: intent(plan),
        repoRoot: root,
      });
      expect(preview.files.length).toBeGreaterThan(0);
      expect(yield* files.exists(root)).toBe(false);
      const service = yield* ApplyService;
      const result = yield* service.apply({
        apply: intent(plan),
        repoRoot: root,
      });
      expect(result.created.length).toBeGreaterThan(0);
      expect(yield* files.exists(root)).toBe(true);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "accepts an alias that resolves to the planned repository root",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repoRoot, { recursive: true });
        yield* files.symlink(repoRoot, "/alias");
        const plan = yield* build;
        const service = yield* ApplyService;
        const result = yield* service.preview({
          apply: intent(plan),
          repoRoot: "/alias",
        });
        expect(result.failed).toEqual([]);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects non-text contents at a planned path", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repoRoot, { recursive: true });
      const plan = yield* build;
      const planned = plan.outcomes.find((entry) => entry.path.endsWith(".ts"));
      assert(planned, "Expected planned TypeScript file");
      const absolute = `${repoRoot}/${planned.path}`;
      yield* files.makeDirectory(absolute.slice(0, absolute.lastIndexOf("/")), {
        recursive: true,
      });
      yield* files.writeFile(absolute, Uint8Array.of(0xff, 0x00));
      const failure = yield* Effect.flip(build);
      assert(failure._tag === "PlanFailure");
      expect(failure.reason).toBe("repoStateUnsupported");
      expect(failure.message).toContain(planned.path);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects a symbolic link at a planned path", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repoRoot, { recursive: true });
      const plan = yield* build;
      const planned = plan.outcomes.find((entry) => entry.path.endsWith(".ts"));
      assert(planned, "Expected planned TypeScript file");
      const absolute = `${repoRoot}/${planned.path}`;
      yield* files.makeDirectory(absolute.slice(0, absolute.lastIndexOf("/")), {
        recursive: true,
      });
      yield* files.writeFileString(
        "/external.ts",
        "export const external = true;",
      );
      yield* files.symlink("/external.ts", absolute);
      const failure = yield* Effect.flip(build);
      assert(failure._tag === "PlanFailure");
      expect(failure.reason).toBe("repoStateUnsupported");
      expect(failure.message).toContain(planned.path);
    }).pipe(Effect.provide(TestLayer)),
  );
  it.effect(
    "rejects a newly created planned path before preview or apply",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repoRoot, { recursive: true });
        const plan = yield* build;
        const planned = plan.baseline.paths.find(
          (entry) => entry._tag === "missing" && entry.path.endsWith(".ts"),
        );
        assert(planned, "Expected a missing planned TypeScript path");
        const absolute = `${repoRoot}/${planned.path}`;
        yield* files.makeDirectory(
          absolute.slice(0, absolute.lastIndexOf("/")),
          { recursive: true },
        );
        yield* files.writeFileString(absolute, "private new content");

        const service = yield* ApplyService;
        const preview = yield* Effect.flip(
          service.preview({ apply: intent(plan), repoRoot }),
        );
        expect(preview).toBeInstanceOf(StalePlanFailure);
        assert(preview._tag === "StalePlanFailure");
        expect(preview.changes).toContainEqual({
          path: planned.path,
          kind: "created",
        });
        expect(preview.message).not.toContain("private new content");

        const apply = yield* Effect.flip(
          service.apply({ apply: intent(plan), repoRoot }),
        );
        expect(apply).toBeInstanceOf(StalePlanFailure);
        assert(apply._tag === "StalePlanFailure");
        expect(apply.partialResult.created).toEqual([]);
        expect(yield* files.readFileString(absolute)).toBe(
          "private new content",
        );

        const previews = yield* ApplyPreviewService;
        const filesPreview = yield* Effect.flip(
          previews.preview({ apply: intent(plan), repoRoot }),
        );
        expect(filesPreview).toBeInstanceOf(StalePlanFailure);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "rejects a different repository even when planned paths match",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repoRoot, { recursive: true });
        yield* files.makeDirectory("/other", { recursive: true });
        const plan = yield* build;
        const service = yield* ApplyService;
        const failure = yield* Effect.flip(
          service.preview({ apply: intent(plan), repoRoot: "/other" }),
        );
        expect(failure).toBeInstanceOf(StalePlanFailure);
        assert(failure._tag === "StalePlanFailure");
        expect(failure.changes).toContainEqual({
          path: ".",
          kind: "rootChanged",
        });
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("makes a Plan stale after its first successful Apply", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repoRoot, { recursive: true });
      const plan = yield* build;
      const service = yield* ApplyService;
      const result = yield* service.apply({ apply: intent(plan), repoRoot });
      expect(result.created.length).toBeGreaterThan(0);
      const second = yield* Effect.flip(
        service.apply({ apply: intent(plan), repoRoot }),
      );
      expect(second).toBeInstanceOf(StalePlanFailure);
      assert(second._tag === "StalePlanFailure");
      expect(second.partialResult.created).toEqual([]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "checks an unchanged planned file and accepts restored contents",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repoRoot, { recursive: true });
        const service = yield* ApplyService;
        const firstPlan = yield* build;
        yield* service.apply({ apply: intent(firstPlan), repoRoot });

        const plan = yield* build;
        const unchanged = plan.outcomes.find(
          (entry) => entry.classification === "unchanged",
        );
        assert(unchanged, "Expected an unchanged planned path");
        const absolute = `${repoRoot}/${unchanged.path}`;
        const original = yield* files.readFileString(absolute);
        yield* files.writeFileString(absolute, "private changed contents");

        const failure = yield* Effect.flip(
          service.preview({ apply: intent(plan), repoRoot }),
        );
        assert(failure._tag === "StalePlanFailure");
        expect(failure.changes).toContainEqual({
          path: unchanged.path,
          kind: "modified",
        });
        expect(failure.message).not.toContain("private changed contents");
        yield* files.writeFileString(absolute, original);

        const result = yield* service.preview({
          apply: intent(plan),
          repoRoot,
        });
        expect(result.failed).toEqual([]);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects deletion of an existing planned file", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repoRoot, { recursive: true });
      const service = yield* ApplyService;
      yield* service.apply({ apply: intent(yield* build), repoRoot });

      const plan = yield* build;
      const existing = plan.baseline.paths.find(
        (entry) => entry._tag === "file",
      );
      assert(existing, "Expected a file in the Plan baseline");
      yield* files.remove(`${repoRoot}/${existing.path}`);

      const failure = yield* Effect.flip(
        service.preview({ apply: intent(plan), repoRoot }),
      );
      assert(failure._tag === "StalePlanFailure");
      expect(failure.changes).toContainEqual({
        path: existing.path,
        kind: "deleted",
      });
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("detects a UTF-8 byte order mark added after planning", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repoRoot, { recursive: true });
      const service = yield* ApplyService;
      yield* service.apply({ apply: intent(yield* build), repoRoot });
      const plan = yield* build;
      const existing = plan.baseline.paths.find(
        (entry) => entry._tag === "file",
      );
      assert(existing, "Expected a file in the Plan baseline");
      const absolute = `${repoRoot}/${existing.path}`;
      const original = yield* files.readFileString(absolute);
      yield* files.writeFileString(absolute, `\uFEFF${original}`);
      const failure = yield* Effect.flip(
        service.preview({ apply: intent(plan), repoRoot }),
      );
      assert(failure._tag === "StalePlanFailure");
      expect(failure.changes).toContainEqual({
        path: existing.path,
        kind: "modified",
      });
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "reports all preflight changes, including an ancestor, before writing",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repoRoot, { recursive: true });
        const plan = yield* build;
        const planned = plan.outcomes.find(
          (entry) =>
            entry.classification === "create" && entry.path.includes("/"),
        );
        assert(planned, "Expected a nested planned file");
        const ancestor = plan.baseline.paths.find(
          (entry) =>
            entry._tag === "missing" &&
            planned.path.startsWith(`${entry.path}/`),
        );
        assert(ancestor, "Expected a missing planned ancestor");
        const absolute = `${repoRoot}/${planned.path}`;
        yield* files.makeDirectory(
          absolute.slice(0, absolute.lastIndexOf("/")),
          { recursive: true },
        );
        yield* files.writeFileString(absolute, "external content");

        const service = yield* ApplyService;
        const failure = yield* Effect.flip(
          service.apply({ apply: intent(plan), repoRoot }),
        );
        assert(failure._tag === "StalePlanFailure");
        expect(failure.changes).toContainEqual({
          path: ancestor.path,
          kind: "created",
        });
        expect(failure.changes).toContainEqual({
          path: planned.path,
          kind: "created",
        });
        expect(failure.partialResult.created).toEqual([]);
        expect(failure.partialResult.modified).toEqual([]);
        expect(yield* files.readFileString(absolute)).toBe("external content");
        const untouched = plan.outcomes.find(
          (entry) =>
            entry.classification === "create" && entry.path !== planned.path,
        );
        assert(untouched, "Expected another planned write");
        expect(yield* files.exists(`${repoRoot}/${untouched.path}`)).toBe(
          false,
        );
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("treats a changed skipped conflict as a stale Plan", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repoRoot, { recursive: true });
      const firstPlan = yield* build;
      const service = yield* ApplyService;
      yield* service.apply({ apply: intent(firstPlan), repoRoot });
      const candidate = firstPlan.outcomes.find(
        (entry) =>
          entry._tag === "composed" && entry.path.endsWith("package.json"),
      );
      assert(candidate, "Expected a planned package.json merge");
      const absolute = `${repoRoot}/${candidate.path}`;
      yield* files.writeFileString(
        absolute,
        '{"name":"@repo/domain","exports":{"./Api":"./local.ts"}}',
      );

      const plan = yield* build;
      const conflict = plan.outcomes.find(
        (entry) =>
          entry.path === candidate.path && entry.classification === "conflict",
      );
      assert(conflict, "Expected a conflict for changed local content");
      const decisions = plan.outcomes
        .filter((entry) => entry.classification === "conflict")
        .map((entry) => ({ path: entry.path, value: "skip" as const }));
      yield* files.writeFileString(
        absolute,
        '{"name":"@repo/domain","exports":{"./Api":"./other.ts"}}',
      );

      const failure = yield* Effect.flip(
        service.apply({ apply: new Apply({ plan, decisions }), repoRoot }),
      );
      assert(failure._tag === "StalePlanFailure");
      expect(failure.changes).toContainEqual({
        path: candidate.path,
        kind: "modified",
      });
      expect(failure.partialResult.created).toEqual([]);
      expect(yield* files.readFileString(absolute)).toBe(
        '{"name":"@repo/domain","exports":{"./Api":"./other.ts"}}',
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "stops when a foreign owner appears after an authorized write",
    () =>
      Effect.gen(function* () {
        const files = yield* MemoryFileSystem.make.pipe(
          Effect.provide(BrowserCrypto.layer),
        );
        yield* files.makeDirectory(repoRoot, { recursive: true });
        const foreign = `${repoRoot}/packages/foreign/package.json`;
        const trigger = { first: "" };
        const wrapped = {
          ...files,
          rename: (from: string, to: string) =>
            files
              .rename(from, to)
              .pipe(
                Effect.tap(() =>
                  to === trigger.first
                    ? ownerManifest("packages/foreign", "@repo/foreign").pipe(
                        Effect.provideService(FileSystem.FileSystem, files),
                      )
                    : Effect.void,
                ),
              ),
        };
        const layer = Layer.provideMerge(
          Layer.merge(PlanService.layer, ApplyService.layer).pipe(
            Layer.provide(OfficialCatalogLayer),
          ),
          Layer.merge(
            Layer.succeed(FileSystem.FileSystem, wrapped),
            Path.layer,
          ),
        );
        const failure = yield* Effect.gen(function* () {
          const plan = yield* build;
          const first = plan.outcomes.find(
            (entry) => entry.classification === "create",
          );
          assert(first);
          trigger.first = `${repoRoot}/${first.path}`;
          const service = yield* ApplyService;
          return yield* Effect.flip(
            service.apply({ apply: intent(plan), repoRoot }),
          );
        }).pipe(Effect.provide(layer));
        assert(failure._tag === "StalePlanFailure");
        expect(failure.changes).toContainEqual({
          path: ".",
          kind: "modified",
        });
        expect(failure.partialResult.created).toContain(
          trigger.first.slice(`${repoRoot}/`.length),
        );
        expect(yield* files.readFileString(foreign)).toBe(
          '{"name":"@repo/foreign"}',
        );
      }),
  );

  it.effect(
    "stops with a partial result when a later path changes during Apply",
    () =>
      Effect.gen(function* () {
        const files = yield* MemoryFileSystem.make.pipe(
          Effect.provide(BrowserCrypto.layer),
        );
        yield* files.makeDirectory(repoRoot, { recursive: true });
        const trigger = { first: "", later: "" };
        const wrapped = {
          ...files,
          rename: (from: string, to: string) =>
            files
              .rename(from, to)
              .pipe(
                Effect.tap(() =>
                  to === trigger.first
                    ? files
                        .makeDirectory(
                          trigger.later.slice(
                            0,
                            trigger.later.lastIndexOf("/"),
                          ),
                          { recursive: true },
                        )
                        .pipe(
                          Effect.andThen(
                            files.writeFileString(
                              trigger.later,
                              "external late drift",
                            ),
                          ),
                        )
                    : Effect.void,
                ),
              ),
        };
        const layer = Layer.provideMerge(
          Layer.merge(PlanService.layer, ApplyService.layer).pipe(
            Layer.provide(OfficialCatalogLayer),
          ),
          Layer.merge(
            Layer.succeed(FileSystem.FileSystem, wrapped),
            Path.layer,
          ),
        );
        const result = yield* Effect.gen(function* () {
          const plan = yield* build;
          const creates = plan.outcomes.filter(
            (entry) => entry.classification === "create",
          );
          assert(creates.length >= 2, "Expected two planned writes");
          const first = creates[0];
          const later = creates[1];
          assert(first && later);
          trigger.first = `${repoRoot}/${first.path}`;
          trigger.later = `${repoRoot}/${later.path}`;
          const service = yield* ApplyService;
          return yield* Effect.flip(
            service.apply({ apply: intent(plan), repoRoot }),
          );
        }).pipe(Effect.provide(layer));

        assert(result._tag === "StalePlanFailure");
        expect(result.changes).toContainEqual({
          path: trigger.later.slice(`${repoRoot}/`.length),
          kind: "created",
        });
        expect(result.partialResult.created).toContain(
          trigger.first.slice(`${repoRoot}/`.length),
        );
        expect(result.partialResult.created).not.toContain(
          trigger.later.slice(`${repoRoot}/`.length),
        );
        expect(yield* files.readFileString(trigger.later)).toBe(
          "external late drift",
        );
      }),
  );

  it.effect(
    "continues after a write fails below a newly created directory",
    () =>
      Effect.gen(function* () {
        const rawFileSystem = yield* MemoryFileSystem.make.pipe(
          Effect.provide(BrowserCrypto.layer),
        );
        yield* rawFileSystem.makeDirectory(repoRoot, { recursive: true });
        const rawLayer = Layer.mergeAll(
          Layer.succeed(FileSystem.FileSystem, rawFileSystem),
          Path.layer,
        );
        const baseline = yield* Effect.gen(function* () {
          const state = yield* RepositoryStateService;
          return yield* state.capture({
            repoRoot,
            paths: [".", "src", "src/a.txt", "src/b.txt"],
          });
        }).pipe(
          Effect.provide(
            RepositoryStateService.layer.pipe(Layer.provide(rawLayer)),
          ),
        );
        let failedFirstWrite = false;
        const failingFileSystem = new Proxy(rawFileSystem, {
          get(target, key) {
            if (key === "writeFileString") {
              return (
                filePath: string,
                contents: string,
                options?: Parameters<typeof target.writeFileString>[2],
              ) => {
                if (!failedFirstWrite && filePath.includes(".apply-temp-")) {
                  failedFirstWrite = true;
                  return Effect.fail(
                    PlatformError.systemError({
                      _tag: "Unknown",
                      module: "FileSystem",
                      method: "writeFileString",
                      description: "injected temp write failure",
                      pathOrDescriptor: filePath,
                    }),
                  );
                }
                return target.writeFileString(filePath, contents, options);
              };
            }
            return Reflect.get(target, key);
          },
        });
        const apply = new Apply({
          plan: new Plan({
            baseline,
            outcomes: [
              {
                _tag: "complete",
                path: "src/a.txt",
                classification: "create",
                contents: "A",
              },
              {
                _tag: "complete",
                path: "src/b.txt",
                classification: "create",
                contents: "B",
              },
            ],
            conflicts: [],
          }),
          decisions: [],
        });
        const result = yield* Effect.gen(function* () {
          const service = yield* ApplyService;
          return yield* service.apply({ apply, repoRoot });
        }).pipe(
          Effect.provide(
            ApplyService.layer.pipe(
              Layer.provide(
                Layer.mergeAll(
                  Layer.succeed(FileSystem.FileSystem, failingFileSystem),
                  Path.layer,
                ),
              ),
            ),
          ),
        );

        expect(failedFirstWrite).toBe(true);
        expect(result.created).toEqual(["src/b.txt"]);
        expect(result.failed.map((entry) => entry.path)).toEqual(["src/a.txt"]);
        expect(
          yield* rawFileSystem.readFileString(`${repoRoot}/src/b.txt`),
        ).toBe("B");
      }),
  );
});
