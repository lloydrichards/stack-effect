// This test intentionally constructs a Windows Path service from Node's win32 implementation.
// @effect-diagnostics nodeBuiltinImport:off

import { createHash } from "node:crypto";
import nodePath from "node:path";
import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { Apply, type ApplyDecision } from "@repo/domain/Apply";
import { Blueprint } from "@repo/domain/Blueprint";
import {
  type CompositionOperation,
  Plan,
  type PlanOutcome,
} from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { RepositoryStateService } from "../plan/RepositoryStateService";
import { ApplyPreviewService } from "./ApplyPreviewService";
import { ApplyWorkspaceService } from "./ApplyWorkspaceService";

const repoRoot = "/repo";
const JsonFromJsonString = Schema.fromJsonString(Schema.Json);
const decodeJson = Schema.decodeUnknownSync(JsonFromJsonString);
const encodeJson = Schema.encodeSync(JsonFromJsonString);

const complete = (
  path: string,
  classification: "create" | "modify" | "unchanged" | "conflict",
  contents: string,
): typeof PlanOutcome.Type => ({
  _tag: "complete",
  path,
  classification,
  contents,
});

const composed = (
  path: string,
  classification: "create" | "modify" | "unchanged" | "conflict",
  operations: ReadonlyArray<typeof CompositionOperation.Type>,
): typeof PlanOutcome.Type => ({
  _tag: "composed",
  path,
  classification,
  operations,
});

const makeApply = (
  outcomes: ReadonlyArray<typeof PlanOutcome.Type>,
  decisions: ReadonlyArray<typeof ApplyDecision.Type> = [],
  root = repoRoot,
  existingContents: Readonly<Record<string, string>> = {},
) =>
  new Apply({
    plan: new Plan({
      baseline: {
        root,
        paths: outcomes.map((outcome) => {
          const contents = existingContents[outcome.path];
          return contents === undefined
            ? { _tag: "missing" as const, path: outcome.path }
            : {
                _tag: "file" as const,
                path: outcome.path,
                sha256: createHash("sha256").update(contents).digest("hex"),
              };
        }),
      },
      outcomes: [...outcomes],
      conflicts: outcomes
        .filter((outcome) => outcome.classification === "conflict")
        .map((outcome) => ({
          _tag: "completeFile" as const,
          path: outcome.path,
        })),
    }),
    decisions: [...decisions],
  });

const TestLayer = Layer.provideMerge(
  ApplyPreviewService.layer,
  Layer.mergeAll(
    Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
    Path.layer,
    OfficialCatalogLayer,
  ),
);
const WorkspaceTestLayer = Layer.provideMerge(
  ApplyWorkspaceService.layer,
  Layer.mergeAll(
    Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
    Path.layer,
    OfficialCatalogLayer,
  ),
);
describe("ApplyPreviewService", () => {
  it.effect("should return contents when creating a file", () =>
    Effect.gen(function* () {
      const service = yield* ApplyPreviewService;
      const result = yield* service.preview({
        apply: makeApply([
          complete("src/index.ts", "create", 'export const value = "ok";\n'),
        ]),
        repoRoot,
      });

      expect(result.apply.created).toEqual(["src/index.ts"]);
      expect(result.files).toEqual([
        {
          path: "src/index.ts",
          status: "created",
          contents: 'export const value = "ok";\n',
        },
      ]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("should isolate writes when host Apply is live", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* FileSystem.FileSystem;

      const service = yield* ApplyPreviewService;
      const result = yield* service.preview({
        apply: makeApply([
          complete("src/index.ts", "create", "export const ok = true;\n"),
        ]),
        repoRoot,
      });

      expect(result.apply.failed).toEqual([]);
      expect(result.files.map((file) => file.path)).toEqual(["src/index.ts"]);
      expect(yield* hostFileSystem.exists("/workspace/src/index.ts")).toBe(
        false,
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("should preserve BOM-prefixed baseline bytes in file preview", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* FileSystem.FileSystem;
      const service = yield* ApplyPreviewService;
      const original = "\uFEFFuser code";
      yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
      yield* hostFileSystem.writeFileString(
        `${repoRoot}/existing.ts`,
        original,
      );

      const result = yield* service.preview({
        apply: makeApply(
          [
            complete("existing.ts", "unchanged", "user code"),
            complete("created.ts", "create", "generated code"),
          ],
          [],
          repoRoot,
          { "existing.ts": original },
        ),
        repoRoot,
      });

      expect(result.apply.created).toEqual(["created.ts"]);
      expect(result.files).toEqual([
        { path: "created.ts", status: "created", contents: "generated code" },
      ]);
      expect(yield* hostFileSystem.readFile(`${repoRoot}/existing.ts`)).toEqual(
        new TextEncoder().encode(original),
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "should preserve unchanged baseline files while previewing writes",
    () =>
      Effect.gen(function* () {
        const hostFileSystem = yield* FileSystem.FileSystem;
        const service = yield* ApplyPreviewService;
        yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
        yield* hostFileSystem.writeFileString(
          `${repoRoot}/existing.ts`,
          "user code",
        );

        const result = yield* service.preview({
          apply: makeApply(
            [
              complete("existing.ts", "unchanged", "user code"),
              complete("created.ts", "create", "generated code"),
            ],
            [],
            repoRoot,
            { "existing.ts": "user code" },
          ),
          repoRoot,
        });

        expect(result.apply.created).toEqual(["created.ts"]);
        expect(result.apply.skipped).toEqual(["existing.ts"]);
        expect(result.files).toEqual([
          { path: "created.ts", status: "created", contents: "generated code" },
        ]);
        expect(
          yield* hostFileSystem.readFileString(`${repoRoot}/existing.ts`),
        ).toBe("user code");
        expect(yield* hostFileSystem.exists(`${repoRoot}/created.ts`)).toBe(
          false,
        );
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("should preserve the host file when composing", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* FileSystem.FileSystem;
      const service = yield* ApplyPreviewService;
      const original = encodeJson({ name: "app", private: true });
      yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
      yield* hostFileSystem.writeFileString(
        `${repoRoot}/package.json`,
        original,
      );

      const result = yield* service.preview({
        apply: makeApply(
          [
            composed("package.json", "modify", [
              {
                _tag: "json-pkg-scripts",
                fileType: "json",
                entries: [{ name: "dev", value: "vite" }],
              },
            ]),
          ],
          [],
          repoRoot,
          { "package.json": original },
        ),
        repoRoot,
      });

      expect(result.apply.failed).toEqual([]);
      expect(result.apply.modified).toEqual(["package.json"]);
      expect(result.files[0]?.contents).toBe(`{
  "name": "app",
  "private": true,
  "scripts": {
    "dev": "vite"
  }
}
`);
      expect(
        yield* hostFileSystem.readFileString(`${repoRoot}/package.json`),
      ).toBe(original);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("should use POSIX paths when the host uses Windows", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* MemoryFileSystem.make.pipe(
        Effect.provide(BrowserCrypto.layer),
      );
      const posixPath = yield* Path.Path.pipe(Effect.provide(Path.layer));
      const windowsPath = Path.Path.of({
        ...posixPath,
        sep: "\\",
        basename: nodePath.win32.basename,
        dirname: nodePath.win32.dirname,
        extname: nodePath.win32.extname,
        format: nodePath.win32.format,
        isAbsolute: nodePath.win32.isAbsolute,
        join: nodePath.win32.join,
        normalize: nodePath.win32.normalize,
        parse: nodePath.win32.parse,
        relative: nodePath.win32.relative,
        resolve: nodePath.win32.resolve,
        toNamespacedPath: nodePath.win32.toNamespacedPath,
      });
      const hostLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, hostFileSystem),
        Layer.succeed(Path.Path, windowsPath),
      );
      const previewLayer = ApplyPreviewService.layer.pipe(
        Layer.provide(hostLayer),
        Layer.provide(OfficialCatalogLayer),
      );
      const windowsRepoRoot = "C:\\repo";
      const packageJsonPath = nodePath.win32.join(
        windowsRepoRoot,
        "package.json",
      );
      const original = encodeJson({ name: "windows-app" });
      yield* hostFileSystem.writeFileString(packageJsonPath, original);
      const windowsBaseline = yield* Effect.gen(function* () {
        const state = yield* RepositoryStateService;
        return yield* state.capture({
          repoRoot: windowsRepoRoot,
          paths: ["package.json"],
        });
      }).pipe(
        Effect.provide(
          RepositoryStateService.layer.pipe(Layer.provide(hostLayer)),
        ),
      );

      const result = yield* Effect.gen(function* () {
        const service = yield* ApplyPreviewService;
        return yield* service.preview({
          apply: makeApply(
            [
              composed("package.json", "modify", [
                {
                  _tag: "json-pkg-scripts",
                  fileType: "json",
                  entries: [{ name: "dev", value: "vite" }],
                },
              ]),
            ],
            [],
            windowsBaseline.root,
            { "package.json": original },
          ),
          repoRoot: windowsRepoRoot,
        });
      }).pipe(Effect.provide(previewLayer));

      expect(result.apply.failed).toEqual([]);
      expect(result.apply.modified).toEqual(["package.json"]);
      expect(decodeJson(result.files[0]?.contents ?? "")).toEqual({
        name: "windows-app",
        scripts: { dev: "vite" },
      });
      expect(yield* hostFileSystem.readFileString(packageJsonPath)).toBe(
        original,
      );
    }),
  );

  it.effect("should omit contents when a conflict is skipped", () =>
    Effect.gen(function* () {
      const service = yield* ApplyPreviewService;
      const result = yield* service.preview({
        apply: makeApply(
          [complete("existing.ts", "conflict", "replacement")],
          [{ path: "existing.ts", value: "skip" }],
        ),
        repoRoot,
      });

      expect(result.apply.skipped).toEqual(["existing.ts"]);
      expect(result.files).toEqual([]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("should sort files when returning a preview", () =>
    Effect.gen(function* () {
      const service = yield* ApplyPreviewService;
      const result = yield* service.preview({
        apply: makeApply([
          complete("z.ts", "create", "z"),
          complete("a.ts", "create", "a"),
        ]),
        repoRoot,
      });

      expect(result.files.map((file) => file.path)).toEqual(["a.ts", "z.ts"]);
    }).pipe(Effect.provide(TestLayer)),
  );
});

describe("ApplyWorkspaceService", () => {
  it.effect(
    "materializes an incremental Apply from one seeded repository state",
    () =>
      Effect.gen(function* () {
        const hostFileSystem = yield* FileSystem.FileSystem;
        const workspaces = yield* ApplyWorkspaceService;
        const originalPackage = encodeJson({ name: "app", private: true });
        yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
        yield* hostFileSystem.writeFileString(
          `${repoRoot}/package.json`,
          originalPackage,
        );
        yield* hostFileSystem.writeFileString(
          `${repoRoot}/notes.txt`,
          "user notes",
        );
        yield* hostFileSystem.writeFileString(
          `${repoRoot}/keep.ts`,
          "user code",
        );

        const apply = makeApply(
          [
            composed("package.json", "modify", [
              {
                _tag: "json-pkg-scripts",
                fileType: "json",
                entries: [{ name: "dev", value: "vite" }],
              },
            ]),
            complete("keep.ts", "conflict", "generated code"),
            complete("src/new.ts", "create", "new code"),
          ],
          [{ path: "keep.ts", value: "skip" }],
          repoRoot,
          { "package.json": originalPackage, "keep.ts": "user code" },
        );
        const workspace = yield* workspaces.create({
          repoRoot,
          baseline: apply.plan.baseline,
        });
        const result = yield* workspace.materialize(apply);

        expect(result.apply.created).toEqual(["src/new.ts"]);
        expect(result.apply.modified).toEqual(["package.json"]);
        expect(result.apply.skipped).toEqual(["keep.ts"]);
        expect(result.apply.failed).toEqual([]);
        expect(result.files.map((file) => [file.path, file.status])).toEqual([
          ["package.json", "modified"],
          ["src/new.ts", "created"],
        ]);
        expect(decodeJson(result.files[0]?.contents ?? "")).toEqual({
          name: "app",
          private: true,
          scripts: { dev: "vite" },
        });
        expect(result.files[1]?.contents).toBe("new code");
        expect(
          yield* hostFileSystem.readFileString(`${repoRoot}/package.json`),
        ).toBe(originalPackage);
        expect(
          yield* hostFileSystem.readFileString(`${repoRoot}/keep.ts`),
        ).toBe("user code");
        expect(
          yield* hostFileSystem.readFileString(`${repoRoot}/notes.txt`),
        ).toBe("user notes");
        expect(yield* hostFileSystem.exists(`${repoRoot}/src/new.ts`)).toBe(
          false,
        );
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            ApplyWorkspaceService.layer.pipe(
              Layer.provide(OfficialCatalogLayer),
            ),
            Layer.merge(
              Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
              Path.layer,
            ),
          ),
        ),
      ),
  );

  it.effect("rejects an obstructing ancestor before materialization", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* FileSystem.FileSystem;
      const workspaces = yield* ApplyWorkspaceService;
      yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
      yield* hostFileSystem.writeFileString(`${repoRoot}/src`, "user file");
      const apply = new Apply({
        plan: new Plan({
          baseline: {
            root: repoRoot,
            paths: [
              { _tag: "directory", path: "." },
              {
                _tag: "file",
                path: "src",
                sha256: createHash("sha256").update("user file").digest("hex"),
              },
              { _tag: "missing", path: "src/new.ts" },
            ],
          },
          outcomes: [complete("src/new.ts", "create", "generated")],
          conflicts: [],
        }),
        decisions: [],
      });
      const failure = yield* Effect.flip(
        workspaces.create({ repoRoot, baseline: apply.plan.baseline }),
      );
      expect(failure._tag).toBe("StalePlanFailure");
      if (failure._tag === "StalePlanFailure") {
        expect(failure.changes).toContainEqual({
          path: "src/new.ts",
          kind: "typeChanged",
        });
      }
      expect(yield* hostFileSystem.readFileString(`${repoRoot}/src`)).toBe(
        "user file",
      );
    }).pipe(
      Effect.provide(
        Layer.provideMerge(
          ApplyWorkspaceService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
          Layer.merge(
            Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
            Path.layer,
          ),
        ),
      ),
    ),
  );

  it.effect("rejects a host Plan that changed after workspace creation", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* FileSystem.FileSystem;
      const workspaces = yield* ApplyWorkspaceService;
      yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
      const first = makeApply([complete("bar.txt", "create", "A")]);
      const second = makeApply([complete("foo.txt", "create", "B")]);
      const workspace = yield* workspaces.create({
        repoRoot,
        baseline: first.plan.baseline,
      });
      yield* hostFileSystem.writeFileString(
        `${repoRoot}/foo.txt`,
        "user content",
      );

      const failure = yield* Effect.flip(workspace.materialize(second));
      expect(failure._tag).toBe("StalePlanFailure");
      if (failure._tag === "StalePlanFailure") {
        expect(failure.changes).toContainEqual({
          path: "foo.txt",
          kind: "created",
        });
      }
      expect(yield* hostFileSystem.readFileString(`${repoRoot}/foo.txt`)).toBe(
        "user content",
      );
    }).pipe(Effect.provide(WorkspaceTestLayer)),
  );

  it.effect("rejects a different host baseline even when it is current", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* FileSystem.FileSystem;
      const workspaces = yield* ApplyWorkspaceService;
      yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
      const first = makeApply([complete("bar.txt", "create", "A")]);
      const second = makeApply([complete("foo.txt", "create", "B")]);
      const workspace = yield* workspaces.create({
        repoRoot,
        baseline: first.plan.baseline,
      });

      const failure = yield* Effect.flip(workspace.materialize(second));
      expect(failure._tag).toBe("ApplyFailure");
      if (failure._tag === "ApplyFailure") {
        expect(failure.reason).toBe("invalidApplyIntent");
      }
      expect(yield* hostFileSystem.exists(`${repoRoot}/foo.txt`)).toBe(false);
    }).pipe(Effect.provide(WorkspaceTestLayer)),
  );

  it.effect("rechecks the seeded host Plan before materializing", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* FileSystem.FileSystem;
      const workspaces = yield* ApplyWorkspaceService;
      yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
      const apply = makeApply([complete("foo.txt", "create", "generated")]);
      const workspace = yield* workspaces.create({
        repoRoot,
        baseline: apply.plan.baseline,
      });
      yield* hostFileSystem.writeFileString(
        `${repoRoot}/foo.txt`,
        "user content",
      );

      const failure = yield* Effect.flip(workspace.materialize(apply));
      expect(failure._tag).toBe("StalePlanFailure");
      if (failure._tag === "StalePlanFailure") {
        expect(failure.changes).toContainEqual({
          path: "foo.txt",
          kind: "created",
        });
      }
      expect(yield* hostFileSystem.readFileString(`${repoRoot}/foo.txt`)).toBe(
        "user content",
      );
    }).pipe(Effect.provide(WorkspaceTestLayer)),
  );

  it.effect("materializes a Plan built in a seeded workspace", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* FileSystem.FileSystem;
      const workspaces = yield* ApplyWorkspaceService;
      yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
      const workspace = yield* workspaces.create({
        repoRoot,
        baseline: { root: repoRoot, paths: [{ _tag: "directory", path: "." }] },
      });
      const plan = yield* workspace.plan({
        blueprint: new Blueprint({ nodes: [], edges: [] }),
        config: new StackConfig({
          name: Schema.NonEmptyString.make("app"),
          runtime: { _tag: "bun" },
        }),
      });
      const result = yield* workspace.materialize(
        new Apply({ plan, decisions: [] }),
      );

      expect(plan.baseline.root).toBe("/workspace");
      expect(result.apply.failed).toEqual([]);
      expect(result.files).toEqual([]);
    }).pipe(Effect.provide(WorkspaceTestLayer)),
  );
});
