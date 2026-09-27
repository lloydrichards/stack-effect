import assert from "node:assert/strict";
import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import { Apply, StalePlanFailure } from "@repo/domain/Apply";
import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { Plan } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, FileSystem, Layer, Path } from "effect";
import { ApplyPreviewService } from "../apply/ApplyPreviewService";
import { ApplyService } from "../apply/ApplyService";
import { PlanService } from "./PlanService";

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
  ),
  Layer.merge(
    Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
    Path.layer,
  ),
);

const buildAt = (root: string) =>
  Effect.gen(function* () {
    const plans = yield* PlanService;
    return yield* plans.build({ blueprint, repoRoot: root, config });
  });
const build = buildAt(repoRoot);

const intent = (plan: Plan) => new Apply({ plan, decisions: [] });

describe("Plan and Apply repository state", () => {
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
      yield* files.writeFileString(absolute, "original invalid JSON");

      const plan = yield* build;
      const conflict = plan.outcomes.find(
        (entry) =>
          entry.path === candidate.path && entry.classification === "conflict",
      );
      assert(conflict, "Expected a conflict for changed local content");
      const decisions = plan.outcomes
        .filter((entry) => entry.classification === "conflict")
        .map((entry) => ({ path: entry.path, value: "skip" as const }));
      yield* files.writeFileString(absolute, "changed after planning");

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
        "changed after planning",
      );
    }).pipe(Effect.provide(TestLayer)),
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
          Layer.merge(PlanService.layer, ApplyService.layer),
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
});
