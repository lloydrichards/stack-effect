import assert from "node:assert/strict";
import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { Apply, StalePlanFailure } from "@repo/domain/Apply";
import {
  Blueprint,
  BlueprintTargetNode,
  makeBlueprintEdge,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { Plan, RepositoryPath } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, FileSystem, Layer, Path, PlatformError, Schema } from "effect";
import { ApplyService } from "../apply/ApplyService";
import { ApplyWorkspaces } from "../apply/ApplyWorkspaces";
import { PlanService } from "./PlanService";
import { RepositoryState } from "./RepositoryState";

const repositoryRoot = "/repo";
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
  edges: [makeBlueprintEdge("owns-module", target.toKey(), moduleNodeId)],
}).toSorted();
const config = new StackConfig({
  name: "test-project",
  runtime: { _tag: "bun" },
});

const TestLayer = Layer.provideMerge(
  Layer.mergeAll(
    PlanService.layer,
    ApplyService.layer,
    ApplyWorkspaces.layer,
    RepositoryState.layer,
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
    return yield* plans.build({ blueprint, repositoryRoot: root, config });
  });
const build = buildAt(repositoryRoot);

const intent = (plan: Plan) => new Apply({ plan, decisions: [] });

/** Previews an Apply the way the CLI dry run does: seed from its baseline, then materialize. */
const preview = ({
  apply,
  repositoryRoot,
}: {
  apply: Apply;
  repositoryRoot: string;
}) =>
  Effect.gen(function* () {
    const workspaces = yield* ApplyWorkspaces;
    const workspace = yield* workspaces.fromRepository({
      repositoryRoot,
      baseline: apply.plan.baseline,
    });
    return yield* workspace.materialize(apply);
  });

const writeManifest = (directory: string, contents: string) =>
  Effect.gen(function* () {
    const files = yield* FileSystem.FileSystem;
    const absolute = `${repositoryRoot}/${directory}`;
    yield* files.makeDirectory(absolute, { recursive: true });
    yield* files.writeFileString(`${absolute}/package.json`, contents);
  });
const ownerManifest = (directory: string, name: string) =>
  writeManifest(directory, JSON.stringify({ name }));
const packageNode = (name: string): BlueprintTargetNode => {
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
const targetBlueprint = (nodes: ReadonlyArray<BlueprintTargetNode>) =>
  new Blueprint({ nodes, edges: [] }).toSorted();
const buildProposed = (proposed: Blueprint) =>
  Effect.gen(function* () {
    const plans = yield* PlanService;
    return yield* plans.build({ blueprint: proposed, repositoryRoot, config });
  });

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
            `${repositoryRoot}/package.json`,
            '{"name":"project","workspaces":["apps/**","packages/**","tools/*"],"scripts":{"custom":"echo custom"}}',
          );
          yield* files.writeFileString(
            `${repositoryRoot}/deno.json`,
            '{"workspace":["apps/**","packages/**"],"tasks":{"custom":"echo custom"}}',
          );
          yield* files.writeFileString(
            `${repositoryRoot}/pnpm-workspace.yaml`,
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
              repositoryRoot,
              config: configuration,
            });
          for (const name of ["sdk/client", "sdk/codecs"]) {
            const plan = yield* planAt(name);
            expect(plan.conflicts.map((conflict) => conflict.path)).toEqual(
              name === "sdk/client" ? [] : ["README.md"],
            );
            const decisions = plan.conflicts.map(({ path }) => ({
              path,
              value: "skip" as const,
            }));
            expect(
              (yield* apply.apply({
                apply: new Apply({ plan, decisions }),
                repositoryRoot,
              })).failed,
            ).toEqual([]);
          }
          const members = [
            "packages/config-typescript",
            "packages/helper",
            "packages/sdk/client",
            "packages/sdk/codecs",
          ];
          const readJson = (name: string) =>
            files
              .readFileString(`${repositoryRoot}/${name}`)
              .pipe(
                Effect.flatMap(
                  Schema.decodeEffect(
                    Schema.fromJsonString(
                      Schema.Record(Schema.String, Schema.Json),
                    ),
                  ),
                ),
              );
          expect(yield* readJson("package.json")).toMatchObject({
            workspaces: [...members, "tools/*"],
            scripts: { custom: "echo custom" },
          });
          expect(yield* readJson("deno.json")).toMatchObject({
            workspace: members,
            tasks: { custom: "echo custom" },
          });
          const pnpm = yield* files.readFileString(
            `${repositoryRoot}/pnpm-workspace.yaml`,
          );
          expect(pnpm).toBe(
            `packages:\n${members.map((member) => `  - ${member}\n`).join("")}\nallowBuilds:\n  esbuild: true\n`,
          );
          const repeated = yield* planAt("sdk/codecs");
          expect(
            (yield* apply.apply({
              apply: new Apply({
                plan: repeated,
                decisions: repeated.conflicts.map(({ path }) => ({
                  path,
                  value: "skip" as const,
                })),
              }),
              repositoryRoot,
            })).failed,
          ).toEqual([]);
          expect(
            yield* files.readFileString(
              `${repositoryRoot}/pnpm-workspace.yaml`,
            ),
          ).toBe(pnpm);
          expect(
            yield* files.readFileString(`${repositoryRoot}/deno.json`),
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

  const ownershipRejections = [
    ["packages/domain", "@repo/other"],
    ["packages/domain/client", "@repo/client"],
    ["packages/other", "@repo/domain"],
    ["packages/Domain", "@repo/other"],
    ["packages", "@repo/sdk"],
  ] as const;
  for (const [directory, name] of ownershipRejections) {
    it.effect(
      `should reject placement without writes when ${directory} belongs to ${name}`,
      () =>
        Effect.gen(function* () {
          yield* ownerManifest(directory, name);
          const failure = yield* Effect.flip(build);
          expect(failure.message).toContain(directory);
          const files = yield* FileSystem.FileSystem;
          expect(
            yield* files.exists(`${repositoryRoot}/packages/domain/src/Api.ts`),
          ).toBe(false);
        }).pipe(Effect.provide(TestLayer)),
    );
  }
  for (const names of [
    ["sdk", "sdk/client"],
    ["sdk-client", "sdk/client"],
  ]) {
    it.effect(
      `should reject ambiguous ownership when ${names.join(" and ")} are selected`,
      () =>
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            buildProposed(targetBlueprint(names.map(packageNode))),
          );
          expect(failure._tag).toBe("PlanFailure");
        }).pipe(Effect.provide(TestLayer)),
    );
  }
  for (const symbolic of [false, true]) {
    it.effect(
      `should reject discovery when a grouping directory has ${symbolic ? "a symbolic link" : "a malformed manifest"}`,
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          if (symbolic) {
            yield* files.makeDirectory(`${repositoryRoot}/packages`, {
              recursive: true,
            });
            yield* files.symlink(
              "/missing-group",
              `${repositoryRoot}/packages/sdk`,
            );
          } else yield* writeManifest("packages/sdk", "invalid json");
          expect((yield* Effect.flip(build))._tag).toBe("PlanFailure");
        }).pipe(Effect.provide(TestLayer)),
    );
  }

  for (const [existingName, proposedName] of [
    ["sdk-client", "sdk/client"],
  ] as const) {
    it.effect(
      `should preserve existing files when ${proposedName} aliases ${existingName}`,
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          const service = yield* ApplyService;
          const initialNode = packageNode(existingName);
          const initial = yield* buildProposed(targetBlueprint([initialNode]));
          yield* service.apply({ apply: intent(initial), repositoryRoot });
          const manifestPath = `${repositoryRoot}/${initialNode.identity.toPath()}/package.json`;
          const original = yield* files.readFileString(manifestPath);
          const proposed = targetBlueprint([packageNode(proposedName)]);
          const failure = yield* Effect.flip(buildProposed(proposed));
          expect(failure._tag).toBe("PlanFailure");
          expect(yield* files.readFileString(manifestPath)).toBe(original);
          expect(
            yield* files.exists(
              `${repositoryRoot}/${packageNode(proposedName).identity.toPath()}/src/index.ts`,
            ),
          ).toBe(false);
        }).pipe(Effect.provide(TestLayer)),
    );
  }

  for (const existingOwner of [false, true]) {
    it.effect(
      existingOwner
        ? "should reject before writes when a planned manifest aliases an existing owner"
        : "should reject before writes when planned manifests share a package name",
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          yield* files.makeDirectory(repositoryRoot, { recursive: true });
          if (existingOwner)
            yield* ownerManifest("packages/existing", "@repo/shared");
          const destinations = existingOwner
            ? ["packages/new"]
            : ["packages/new-a", "packages/new-b"];
          const state = yield* RepositoryState;
          const { baseline } = yield* state.capture({
            repositoryRoot,
            paths: [
              RepositoryPath.make("."),
              RepositoryPath.make("packages"),
              ...destinations.flatMap((path) => [
                RepositoryPath.make(path),
                RepositoryPath.make(`${path}/package.json`),
              ]),
            ],
          });
          const apply = new Apply({
            plan: new Plan({
              baseline,
              outcomes: destinations.map((path) => ({
                _tag: "complete" as const,
                path: RepositoryPath.make(`${path}/package.json`),
                classification: "create" as const,
                contents: '{"name":"@repo/shared"}',
              })),
              conflicts: [],
            }),
            decisions: [],
          });
          const service = yield* ApplyService;
          const failure = yield* Effect.flip(
            service.apply({ apply, repositoryRoot }),
          );
          assert(failure._tag === "ApplyFailure");
          expect(failure.message).toContain("@repo/shared");
          yield* Effect.forEach(destinations, (path) =>
            Effect.gen(function* () {
              expect(yield* files.exists(`${repositoryRoot}/${path}`)).toBe(
                false,
              );
            }),
          );
          if (existingOwner)
            expect(
              yield* files.readFileString(
                `${repositoryRoot}/packages/existing/package.json`,
              ),
            ).toBe('{"name":"@repo/shared"}');
        }).pipe(Effect.provide(TestLayer)),
    );
  }

  it.effect(
    "should complete later writes when a new owner contains an internal template manifest",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repositoryRoot, { recursive: true });
        const contents = [
          ["packages/sdk/package.json", '{"name":"@repo/sdk"}'],
          ["packages/sdk/templates/package.json", "{}"],
          ["packages/sdk/src/index.ts", "export {};"],
        ] as const;
        const state = yield* RepositoryState;
        const { baseline } = yield* state.capture({
          repositoryRoot,
          paths: [
            RepositoryPath.make("."),
            RepositoryPath.make("packages"),
            RepositoryPath.make("packages/sdk"),
            RepositoryPath.make("packages/sdk/templates"),
            RepositoryPath.make("packages/sdk/src"),
            ...contents.map(([path]) => RepositoryPath.make(path)),
          ],
        });
        const plan = new Plan({
          baseline,
          outcomes: contents.map(([path, contents]) => ({
            _tag: "complete",
            path: RepositoryPath.make(path),
            contents,
            classification: "create",
          })),
          conflicts: [],
        });
        const service = yield* ApplyService;
        expect(
          (yield* service.apply({ apply: intent(plan), repositoryRoot }))
            .failed,
        ).toEqual([]);
        expect(
          yield* files.readFileString(
            `${repositoryRoot}/packages/sdk/src/index.ts`,
          ),
        ).toBe("export {};");
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "should ignore internal manifests and symlinks when adding beside an existing owner",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* ownerManifest("packages/helper", "@repo/helper");
        yield* ownerManifest("packages/helper/dist", "@repo/helper");
        yield* writeManifest("packages/helper/tests/fixtures", "{}");
        yield* files.symlink(
          "/missing-source",
          `${repositoryRoot}/packages/helper/source-link`,
        );
        const plan = yield* build;
        expect(plan.baseline.packageOwners).toEqual([
          { path: "packages/helper", name: "@repo/helper" },
        ]);
        const service = yield* ApplyService;
        const result = yield* service.apply({
          apply: intent(plan),
          repositoryRoot,
        });
        expect(result.failed).toEqual([]);
        expect(result.created).toContain("packages/domain/package.json");
      }).pipe(Effect.provide(TestLayer)),
  );

  for (const change of ["removed", "renamed", "discovered"] as const) {
    const discovered = change === "discovered";
    const title = discovered
      ? "should reject Apply when a helper owner is discovered after planning"
      : `should reject Apply when a helper owner is ${change} after planning`;
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
            ? files.remove(`${repositoryRoot}/packages/helper/package.json`)
            : ownerManifest(
                "packages/helper",
                discovered ? "@repo/helper" : "@repo/changed",
              );
        yield* mutation;
        const service = yield* ApplyService;
        const failure = yield* Effect.flip(
          service.apply({ apply: intent(plan), repositoryRoot }),
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
        yield* files.makeDirectory(repositoryRoot, { recursive: true });
        const repositoryState = yield* RepositoryState;
        const workspaces = yield* ApplyWorkspaces;
        const { baseline } = yield* repositoryState.capture({
          repositoryRoot,
          paths: [RepositoryPath.make(".")],
        });
        const workspace = yield* workspaces.fromRepository({
          repositoryRoot,
          baseline,
        });
        const plan = yield* workspace.plan({ blueprint, config });
        const result = yield* workspace.materialize(intent(plan));

        expect(result.apply.created.length).toBeGreaterThan(0);
        expect(result.apply.failed).toEqual([]);
        expect(result.files.map((file) => file.path)).toEqual(
          result.apply.created,
        );
        expect(
          yield* files.exists(`${repositoryRoot}/${result.apply.created[0]}`),
        ).toBe(false);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("plans and applies beneath a missing repository root", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      const root = "/future/repo";
      const plan = yield* buildAt(root);
      expect(plan.baseline.root).toBe(root);
      const previewed = yield* preview({
        apply: intent(plan),
        repositoryRoot: root,
      });
      expect(previewed.files.length).toBeGreaterThan(0);
      expect(yield* files.exists(root)).toBe(false);
      const service = yield* ApplyService;
      const result = yield* service.apply({
        apply: intent(plan),
        repositoryRoot: root,
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
        yield* files.makeDirectory(repositoryRoot, { recursive: true });
        yield* files.symlink(repositoryRoot, "/alias");
        const plan = yield* build;
        const result = yield* preview({
          apply: intent(plan),
          repositoryRoot: "/alias",
        });
        expect(result.apply.failed).toEqual([]);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects non-text contents at a planned path", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repositoryRoot, { recursive: true });
      const plan = yield* build;
      const planned = plan.outcomes.find((entry) => entry.path.endsWith(".ts"));
      assert(planned, "Expected planned TypeScript file");
      const absolute = `${repositoryRoot}/${planned.path}`;
      yield* files.makeDirectory(absolute.slice(0, absolute.lastIndexOf("/")), {
        recursive: true,
      });
      yield* files.writeFile(absolute, Uint8Array.of(0xff, 0x00));
      const failure = yield* Effect.flip(build);
      assert(failure._tag === "PlanFailure");
      expect(failure.message).toContain(planned.path);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects a symbolic link at a planned path", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repositoryRoot, { recursive: true });
      const plan = yield* build;
      const planned = plan.outcomes.find((entry) => entry.path.endsWith(".ts"));
      assert(planned, "Expected planned TypeScript file");
      const absolute = `${repositoryRoot}/${planned.path}`;
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
      expect(failure.message).toContain(planned.path);
    }).pipe(Effect.provide(TestLayer)),
  );
  it.effect(
    "rejects a newly created planned path before preview or apply",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repositoryRoot, { recursive: true });
        const plan = yield* build;
        const planned = plan.baseline.paths.find(
          (entry) => entry._tag === "missing" && entry.path.endsWith(".ts"),
        );
        assert(planned, "Expected a missing planned TypeScript path");
        const absolute = `${repositoryRoot}/${planned.path}`;
        yield* files.makeDirectory(
          absolute.slice(0, absolute.lastIndexOf("/")),
          { recursive: true },
        );
        yield* files.writeFileString(absolute, "private new content");

        const previewFailure = yield* Effect.flip(
          preview({ apply: intent(plan), repositoryRoot }),
        );
        expect(previewFailure).toBeInstanceOf(StalePlanFailure);
        assert(previewFailure._tag === "StalePlanFailure");
        expect(previewFailure.changes).toContainEqual({
          path: planned.path,
          kind: "created",
        });
        expect(previewFailure.message).not.toContain("private new content");

        const service = yield* ApplyService;

        const apply = yield* Effect.flip(
          service.apply({ apply: intent(plan), repositoryRoot }),
        );
        expect(apply).toBeInstanceOf(StalePlanFailure);
        assert(apply._tag === "StalePlanFailure");
        expect(apply.partialResult.created).toEqual([]);
        expect(yield* files.readFileString(absolute)).toBe(
          "private new content",
        );
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "rejects a different repository even when planned paths match",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repositoryRoot, { recursive: true });
        yield* files.makeDirectory("/other", { recursive: true });
        const plan = yield* build;
        const failure = yield* Effect.flip(
          preview({ apply: intent(plan), repositoryRoot: "/other" }),
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
      yield* files.makeDirectory(repositoryRoot, { recursive: true });
      const plan = yield* build;
      const service = yield* ApplyService;
      const result = yield* service.apply({
        apply: intent(plan),
        repositoryRoot,
      });
      expect(result.created.length).toBeGreaterThan(0);
      const second = yield* Effect.flip(
        service.apply({ apply: intent(plan), repositoryRoot }),
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
        yield* files.makeDirectory(repositoryRoot, { recursive: true });
        const service = yield* ApplyService;
        const firstPlan = yield* build;
        yield* service.apply({ apply: intent(firstPlan), repositoryRoot });

        const plan = yield* build;
        const unchanged = plan.outcomes.find(
          (entry) => entry.classification === "unchanged",
        );
        assert(unchanged, "Expected an unchanged planned path");
        const absolute = `${repositoryRoot}/${unchanged.path}`;
        const original = yield* files.readFileString(absolute);
        yield* files.writeFileString(absolute, "private changed contents");

        const failure = yield* Effect.flip(
          preview({ apply: intent(plan), repositoryRoot }),
        );
        assert(failure._tag === "StalePlanFailure");
        expect(failure.changes).toContainEqual({
          path: unchanged.path,
          kind: "modified",
        });
        expect(failure.message).not.toContain("private changed contents");
        yield* files.writeFileString(absolute, original);

        const result = yield* preview({
          apply: intent(plan),
          repositoryRoot,
        });
        expect(result.apply.failed).toEqual([]);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects deletion of an existing planned file", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repositoryRoot, { recursive: true });
      const service = yield* ApplyService;
      yield* service.apply({ apply: intent(yield* build), repositoryRoot });

      const plan = yield* build;
      const existing = plan.baseline.paths.find(
        (entry) => entry._tag === "file",
      );
      assert(existing, "Expected a file in the Plan baseline");
      yield* files.remove(`${repositoryRoot}/${existing.path}`);

      const failure = yield* Effect.flip(
        preview({ apply: intent(plan), repositoryRoot }),
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
      yield* files.makeDirectory(repositoryRoot, { recursive: true });
      const service = yield* ApplyService;
      yield* service.apply({ apply: intent(yield* build), repositoryRoot });
      const plan = yield* build;
      const existing = plan.baseline.paths.find(
        (entry) => entry._tag === "file",
      );
      assert(existing, "Expected a file in the Plan baseline");
      const absolute = `${repositoryRoot}/${existing.path}`;
      const original = yield* files.readFileString(absolute);
      yield* files.writeFileString(absolute, `\uFEFF${original}`);
      const failure = yield* Effect.flip(
        preview({ apply: intent(plan), repositoryRoot }),
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
        yield* files.makeDirectory(repositoryRoot, { recursive: true });
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
        const absolute = `${repositoryRoot}/${planned.path}`;
        yield* files.makeDirectory(
          absolute.slice(0, absolute.lastIndexOf("/")),
          { recursive: true },
        );
        yield* files.writeFileString(absolute, "external content");

        const service = yield* ApplyService;
        const failure = yield* Effect.flip(
          service.apply({ apply: intent(plan), repositoryRoot }),
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
        expect(yield* files.exists(`${repositoryRoot}/${untouched.path}`)).toBe(
          false,
        );
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("treats a changed skipped conflict as a stale Plan", () =>
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem;
      yield* files.makeDirectory(repositoryRoot, { recursive: true });
      const firstPlan = yield* build;
      const service = yield* ApplyService;
      yield* service.apply({ apply: intent(firstPlan), repositoryRoot });
      const candidate = firstPlan.outcomes.find(
        (entry) =>
          entry._tag === "composed" && entry.path.endsWith("package.json"),
      );
      assert(candidate, "Expected a planned package.json merge");
      const absolute = `${repositoryRoot}/${candidate.path}`;
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
        service.apply({
          apply: new Apply({ plan, decisions }),
          repositoryRoot,
        }),
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
        yield* files.makeDirectory(repositoryRoot, { recursive: true });
        const foreign = `${repositoryRoot}/packages/foreign/package.json`;
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
          Layer.mergeAll(
            Layer.succeed(FileSystem.FileSystem, wrapped),
            Path.layer,
            BrowserCrypto.layer,
          ),
        );
        const failure = yield* Effect.gen(function* () {
          const plan = yield* build;
          const first = plan.outcomes.find(
            (entry) => entry.classification === "create",
          );
          assert(first);
          trigger.first = `${repositoryRoot}/${first.path}`;
          const service = yield* ApplyService;
          return yield* Effect.flip(
            service.apply({ apply: intent(plan), repositoryRoot }),
          );
        }).pipe(Effect.provide(layer));
        assert(failure._tag === "StalePlanFailure");
        expect(failure.changes).toContainEqual({
          path: ".",
          kind: "modified",
        });
        expect(failure.partialResult.created).toContain(
          trigger.first.slice(`${repositoryRoot}/`.length),
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
        yield* files.makeDirectory(repositoryRoot, { recursive: true });
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
          Layer.mergeAll(
            Layer.succeed(FileSystem.FileSystem, wrapped),
            Path.layer,
            BrowserCrypto.layer,
          ),
        );
        const result = yield* Effect.gen(function* () {
          const plan = yield* build;
          const creates = plan.outcomes.filter(
            (entry) => entry.classification === "create",
          );
          assert(creates.length >= 2, "Expected two planned writes");
          const first = creates.find(
            (entry) => entry.path === "packages/domain/package.json",
          );
          const later = creates.find(
            (entry) => entry.path === "packages/domain/src/Api.ts",
          );
          assert(first && later);
          trigger.first = `${repositoryRoot}/${first.path}`;
          trigger.later = `${repositoryRoot}/${later.path}`;
          const service = yield* ApplyService;
          return yield* Effect.flip(
            service.apply({ apply: intent(plan), repositoryRoot }),
          );
        }).pipe(Effect.provide(layer));

        assert(result._tag === "StalePlanFailure");
        expect(result.changes).toContainEqual({
          path: trigger.later.slice(`${repositoryRoot}/`.length),
          kind: "created",
        });
        expect(result.partialResult.created).toContain(
          trigger.first.slice(`${repositoryRoot}/`.length),
        );
        expect(result.partialResult.created).not.toContain(
          trigger.later.slice(`${repositoryRoot}/`.length),
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
        yield* rawFileSystem.makeDirectory(repositoryRoot, { recursive: true });
        const rawLayer = Layer.mergeAll(
          Layer.succeed(FileSystem.FileSystem, rawFileSystem),
          Path.layer,
          BrowserCrypto.layer,
        );
        const baseline = yield* Effect.gen(function* () {
          const state = yield* RepositoryState;
          const captured = yield* state.capture({
            repositoryRoot,
            paths: [
              RepositoryPath.make("."),
              RepositoryPath.make("src"),
              RepositoryPath.make("src/a.txt"),
              RepositoryPath.make("src/b.txt"),
            ],
          });
          return captured.baseline;
        }).pipe(
          Effect.provide(RepositoryState.layer.pipe(Layer.provide(rawLayer))),
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
                path: RepositoryPath.make("src/a.txt"),
                classification: "create",
                contents: "A",
              },
              {
                _tag: "complete",
                path: RepositoryPath.make("src/b.txt"),
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
          return yield* service.apply({ apply, repositoryRoot });
        }).pipe(
          Effect.provide(
            ApplyService.layer.pipe(
              Layer.provide(
                Layer.mergeAll(
                  Layer.succeed(FileSystem.FileSystem, failingFileSystem),
                  Path.layer,
                  BrowserCrypto.layer,
                ),
              ),
            ),
          ),
        );

        expect(failedFirstWrite).toBe(true);
        expect(result.created).toEqual(["src/b.txt"]);
        expect(result.failed.map((entry) => entry.path)).toEqual(["src/a.txt"]);
        expect(
          yield* rawFileSystem.readFileString(`${repositoryRoot}/src/b.txt`),
        ).toBe("B");
      }),
  );
});
