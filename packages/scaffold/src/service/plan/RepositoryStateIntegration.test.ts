import assert from "node:assert/strict";
import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
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
          const readJson = (name: string) =>
            files
              .readFileString(`${repoRoot}/${name}`)
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
            yield* files.exists(`${repoRoot}/packages/domain/src/Api.ts`),
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
            yield* files.makeDirectory(`${repoRoot}/packages`, {
              recursive: true,
            });
            yield* files.symlink("/missing-group", `${repoRoot}/packages/sdk`);
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
        ? "should reject before writes when a planned manifest aliases an existing owner"
        : "should reject before writes when planned manifests share a package name",
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
    "should complete later writes when a new owner contains an internal template manifest",
    () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* files.makeDirectory(repoRoot, { recursive: true });
        const contents = [
          ["packages/sdk/package.json", '{"name":"@repo/sdk"}'],
          ["packages/sdk/templates/package.json", "{}"],
          ["packages/sdk/src/index.ts", "export {};"],
        ] as const;
        const state = yield* RepositoryStateService;
        const baseline = yield* state.capture({
          repoRoot,
          paths: [
            ".",
            "packages",
            "packages/sdk",
            "packages/sdk/templates",
            "packages/sdk/src",
            ...contents.map(([path]) => path),
          ],
        });
        const plan = new Plan({
          baseline,
          outcomes: contents.map(([path, contents]) => ({
            _tag: "complete",
            path,
            contents,
            classification: "create",
          })),
          conflicts: [],
        });
        const service = yield* ApplyService;
        expect(
          (yield* service.apply({ apply: intent(plan), repoRoot })).failed,
        ).toEqual([]);
        expect(
          yield* files.readFileString(`${repoRoot}/packages/sdk/src/index.ts`),
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
