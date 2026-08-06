import nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Apply, type ApplyDecision } from "@repo/domain/Apply";
import {
  type CompositionOperation,
  Plan,
  type PlanOutcome,
} from "@repo/domain/Plan";
import { Effect, FileSystem, Layer, Path } from "effect";
import * as MemoryFileSystem from "../../MemoryFileSystem";
import { ApplyPreviewService } from "./ApplyPreviewService";
import { ApplyService } from "./ApplyService";

const repoRoot = "/repo";

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
) =>
  new Apply({
    plan: new Plan({ outcomes: [...outcomes], conflicts: [] }),
    decisions: [...decisions],
  });

const runWithHost = <A, E>(
  effect: Effect.Effect<A, E, ApplyPreviewService | FileSystem.FileSystem>,
) =>
  Effect.gen(function* () {
    const hostFileSystem = yield* MemoryFileSystem.make;
    const hostLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, hostFileSystem),
      Path.layer,
    );
    const previewLayer = ApplyPreviewService.layer.pipe(
      Layer.provide(hostLayer),
    );

    return yield* effect.pipe(
      Effect.provide(Layer.mergeAll(hostLayer, previewLayer)),
    );
  });

describe("ApplyPreviewService", () => {
  it.effect("returns generated contents for a greenfield create", () =>
    runWithHost(
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
      }),
    ),
  );

  it.effect(
    "uses an isolated Apply layer when a host Apply layer is live",
    () =>
      Effect.gen(function* () {
        const hostFileSystem = yield* MemoryFileSystem.make;
        const hostLayer = Layer.mergeAll(
          Layer.succeed(FileSystem.FileSystem, hostFileSystem),
          Path.layer,
        );
        const layer = Layer.mergeAll(
          ApplyService.layer,
          ApplyPreviewService.layer,
        ).pipe(Layer.provide(hostLayer));

        const result = yield* Effect.gen(function* () {
          const service = yield* ApplyPreviewService;
          return yield* service.preview({
            apply: makeApply([
              complete("src/index.ts", "create", "export const ok = true;\n"),
            ]),
            repoRoot,
          });
        }).pipe(Effect.provide(layer));

        expect(result.apply.failed).toEqual([]);
        expect(result.files.map((file) => file.path)).toEqual(["src/index.ts"]);
        expect(yield* hostFileSystem.exists("/workspace/src/index.ts")).toBe(
          false,
        );
      }),
  );

  it.effect("composes from an existing host file without mutating it", () =>
    runWithHost(
      Effect.gen(function* () {
        const hostFileSystem = yield* FileSystem.FileSystem;
        const service = yield* ApplyPreviewService;
        const original = JSON.stringify({ name: "app", private: true });
        yield* hostFileSystem.makeDirectory(repoRoot, { recursive: true });
        yield* hostFileSystem.writeFileString(
          `${repoRoot}/package.json`,
          original,
        );

        const result = yield* service.preview({
          apply: makeApply([
            composed("package.json", "modify", [
              {
                _tag: "json-pkg-scripts",
                fileType: "json",
                entries: [{ name: "dev", value: "vite" }],
              },
            ]),
          ]),
          repoRoot,
        });

        expect(result.apply.modified).toEqual(["package.json"]);
        expect(JSON.parse(result.files[0]?.contents ?? "")).toEqual({
          name: "app",
          private: true,
          scripts: { dev: "vite" },
        });
        expect(
          yield* hostFileSystem.readFileString(`${repoRoot}/package.json`),
        ).toBe(original);
      }),
    ),
  );

  it.effect("keeps virtual paths POSIX with a Windows host path service", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* MemoryFileSystem.make;
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
      );
      const windowsRepoRoot = "C:\\repo";
      const packageJsonPath = nodePath.win32.join(
        windowsRepoRoot,
        "package.json",
      );
      const original = JSON.stringify({ name: "windows-app" });
      yield* hostFileSystem.writeFileString(packageJsonPath, original);

      const result = yield* Effect.gen(function* () {
        const service = yield* ApplyPreviewService;
        return yield* service.preview({
          apply: makeApply([
            composed("package.json", "modify", [
              {
                _tag: "json-pkg-scripts",
                fileType: "json",
                entries: [{ name: "dev", value: "vite" }],
              },
            ]),
          ]),
          repoRoot: windowsRepoRoot,
        });
      }).pipe(Effect.provide(previewLayer));

      expect(result.apply.modified).toEqual(["package.json"]);
      expect(JSON.parse(result.files[0]?.contents ?? "")).toEqual({
        name: "windows-app",
        scripts: { dev: "vite" },
      });
      expect(yield* hostFileSystem.readFileString(packageJsonPath)).toBe(
        original,
      );
    }),
  );

  it.effect("does not return contents for skipped conflicts", () =>
    runWithHost(
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
      }),
    ),
  );

  it.effect("sorts returned files by path", () =>
    runWithHost(
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
      }),
    ),
  );
});
