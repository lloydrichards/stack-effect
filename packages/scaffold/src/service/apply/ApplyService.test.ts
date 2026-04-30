/** @effect-diagnostics globalErrorInEffectFailure:skip-file */
import assert from "node:assert/strict";
import { describe, expect, it } from "@effect/vitest";
import { type ApplyDecision, Apply as ApplyIntent } from "@repo/domain/Apply";
import {
  Plan,
  type PlanEntryClassification,
  type RequiredStructure,
} from "@repo/domain/Plan";
import {
  Cause,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  PlatformError,
} from "effect";
import { ApplyService } from "./ApplyService";
import { StructuralMerger } from "./StructuralMerger";
import { type ApplyWriteRequest, WriteEngine } from "./WriteEngine";

const testRepoRoot = "/repo";

type MockPathEntry =
  | { readonly _tag: "missing" }
  | { readonly _tag: "directory" }
  | { readonly _tag: "file"; readonly contents: string }
  | { readonly _tag: "statError"; readonly error: PlatformError.PlatformError }
  | { readonly _tag: "readError"; readonly error: PlatformError.PlatformError };

type StructuralMergeInput = {
  readonly path: string;
  readonly required: Extract<
    typeof Plan.fields.outcomes.schema.Type,
    { _tag: "partial" }
  >["requiredStructure"];
  readonly existing: Option.Option<string>;
  readonly mode: "create" | "modify" | "override";
};

const makeNotFoundError = (method: string, absolutePath: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "FileSystem",
    method,
    description: "No such file or directory",
    pathOrDescriptor: absolutePath,
  });

const makeFileInfo = (type: FileSystem.File.Type): FileSystem.File.Info => ({
  type,
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0,
  ino: Option.none(),
  mode: 0,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: FileSystem.Size(0),
  blksize: Option.none(),
  blocks: Option.none(),
});

const makeFileSystemLayer = (entries: Record<string, MockPathEntry>) => {
  const getEntry = (absolutePath: string): MockPathEntry =>
    entries[absolutePath] ?? { _tag: "missing" };

  return FileSystem.layerNoop({
    stat: (absolutePath: string) => {
      const entry = getEntry(absolutePath);
      switch (entry._tag) {
        case "missing":
          return Effect.fail(makeNotFoundError("stat", absolutePath));
        case "statError":
          return Effect.fail(entry.error);
        case "directory":
          return Effect.succeed(makeFileInfo("Directory"));
        case "file":
        case "readError":
          return Effect.succeed(makeFileInfo("File"));
      }
    },
    readFileString: (absolutePath: string) => {
      const entry = getEntry(absolutePath);
      switch (entry._tag) {
        case "missing":
          return Effect.fail(makeNotFoundError("readFileString", absolutePath));
        case "readError":
          return Effect.fail(entry.error);
        case "file":
          return Effect.succeed(entry.contents);
        case "directory":
          return Effect.fail(
            PlatformError.systemError({
              _tag: "BadResource",
              module: "FileSystem",
              method: "readFileString",
              description: `Expected file at ${absolutePath}`,
              pathOrDescriptor: absolutePath,
            }),
          );
        case "statError":
          return Effect.fail(
            PlatformError.systemError({
              _tag: "Unknown",
              module: "FileSystem",
              method: "readFileString",
              description: `Expected stat success at ${absolutePath}`,
              pathOrDescriptor: absolutePath,
            }),
          );
      }
    },
  });
};

const makeApplyServiceLayer = ({
  write,
  merge,
  entries = {},
}: {
  write: (args: {
    readonly repoRoot: string;
    readonly write: ApplyWriteRequest;
  }) => Effect.Effect<
    {
      readonly path: string;
      readonly status: "created" | "modified" | "unchanged";
    },
    unknown,
    never
  >;
  merge: (
    input: StructuralMergeInput,
  ) => Effect.Effect<{ readonly path: string; readonly contents: string }>;
  entries?: Record<string, MockPathEntry>;
}) =>
  Layer.effect(ApplyService)(ApplyService.make).pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(WriteEngine, {
          write: Effect.fn("MockWriteEngine.write")(write),
        } as never),
        Layer.succeed(StructuralMerger, {
          merge: Effect.fn("MockStructuralMerger.merge")(merge),
          mergeComposed: Effect.fn("MockStructuralMerger.mergeComposed")(
            () => Effect.succeed({ path: "", contents: "" }),
          ),
        } as never),
        makeFileSystemLayer(entries),
        Path.layer,
      ),
    ),
  );

const makeApply = ({
  outcomes,
  decisions = [],
}: {
  outcomes: typeof Plan.fields.outcomes.Type;
  decisions?: ReadonlyArray<typeof ApplyDecision.Type>;
}) =>
  new ApplyIntent({
    plan: new Plan({
      outcomes: [...outcomes],
      conflicts: [],
    }),
    decisions: [...decisions],
  });

const runApply = ({
  apply,
  layer,
}: {
  apply: ApplyIntent;
  layer: Layer.Layer<ApplyService>;
}) =>
  Effect.gen(function* () {
    const applyService = yield* ApplyService;
    return yield* applyService.apply({ apply, repoRoot: testRepoRoot });
  }).pipe(Effect.provide(layer));

const completeOutcome = ({
  path,
  classification,
  contents,
}: {
  path: string;
  classification: typeof PlanEntryClassification.Type;
  contents: string;
}): typeof Plan.fields.outcomes.schema.Type => ({
  _tag: "complete",
  path,
  classification,
  contents,
});

const partialOutcome = ({
  path,
  classification,
  requiredStructure,
}: {
  path: string;
  classification: typeof PlanEntryClassification.Type;
  requiredStructure: typeof RequiredStructure.Type;
}): typeof Plan.fields.outcomes.schema.Type => ({
  _tag: "partial",
  path,
  classification,
  requiredStructure,
});

describe("ApplyService", () => {
  describe("when applying outcomes", () => {
    it.effect("should skip unchanged outcomes and then avoid writes", () =>
      Effect.gen(function* () {
        const writeCalls: Array<ApplyWriteRequest> = [];
        const mergeCalls: Array<StructuralMergeInput> = [];

        const result = yield* runApply({
          apply: makeApply({
            outcomes: [
              completeOutcome({
                path: "packages/domain/src/Api.ts",
                classification: "unchanged",
                contents: "export const Api = {};\n",
              }),
            ],
          }),
          layer: makeApplyServiceLayer({
            write: ({ write }) => {
              writeCalls.push(write);
              return Effect.succeed({
                path: write.path,
                status: "created" as const,
              });
            },
            merge: (input) => {
              mergeCalls.push(input);
              return Effect.succeed({ path: input.path, contents: "unused" });
            },
          }),
        });

        expect(writeCalls).toHaveLength(0);
        expect(mergeCalls).toHaveLength(0);
        expect(result).toMatchObject({
          created: [],
          modified: [],
          skipped: ["packages/domain/src/Api.ts"],
          failed: [],
        });
      }),
    );

    it.effect(
      "should write authoritative create outcomes and then report created paths",
      () =>
        Effect.gen(function* () {
          const writeCalls: Array<ApplyWriteRequest> = [];

          const result = yield* runApply({
            apply: makeApply({
              outcomes: [
                completeOutcome({
                  path: "packages/domain/src/Api.ts",
                  classification: "create",
                  contents: "export const Api = {};\n",
                }),
              ],
            }),
            layer: makeApplyServiceLayer({
              write: ({ write }) => {
                writeCalls.push(write);
                return Effect.succeed({
                  path: write.path,
                  status: "created" as const,
                });
              },
              merge: (input) =>
                Effect.succeed({ path: input.path, contents: "unused" }),
            }),
          });

          expect(writeCalls).toEqual([
            {
              path: "packages/domain/src/Api.ts",
              contents: "export const Api = {};\n",
              writeMode: "create",
            },
          ]);
          expect(result).toMatchObject({
            created: ["packages/domain/src/Api.ts"],
            modified: [],
            skipped: [],
            failed: [],
          });
        }),
    );

    it.effect(
      "should skip conflicted authoritative outcomes when decision is skip",
      () =>
        Effect.gen(function* () {
          const writeCalls: Array<ApplyWriteRequest> = [];

          const result = yield* runApply({
            apply: makeApply({
              outcomes: [
                completeOutcome({
                  path: "packages/domain/src/Api.ts",
                  classification: "conflict",
                  contents: "export const Api = {};\n",
                }),
              ],
              decisions: [
                {
                  path: "packages/domain/src/Api.ts",
                  value: "skip",
                },
              ],
            }),
            layer: makeApplyServiceLayer({
              write: ({ write }) => {
                writeCalls.push(write);
                return Effect.succeed({
                  path: write.path,
                  status: "modified" as const,
                });
              },
              merge: (input) =>
                Effect.succeed({ path: input.path, contents: "unused" }),
            }),
          });

          expect(writeCalls).toHaveLength(0);
          expect(result).toMatchObject({
            created: [],
            modified: [],
            skipped: ["packages/domain/src/Api.ts"],
            failed: [],
          });
        }),
    );

    it.effect(
      "should default conflicted authoritative outcomes to override when decision is absent",
      () =>
        Effect.gen(function* () {
          const writeCalls: Array<ApplyWriteRequest> = [];

          const result = yield* runApply({
            apply: makeApply({
              outcomes: [
                completeOutcome({
                  path: "packages/domain/src/Api.ts",
                  classification: "conflict",
                  contents: "export const Api = {};\n",
                }),
              ],
            }),
            layer: makeApplyServiceLayer({
              write: ({ write }) => {
                writeCalls.push(write);
                return Effect.succeed({
                  path: write.path,
                  status: "modified" as const,
                });
              },
              merge: (input) =>
                Effect.succeed({ path: input.path, contents: "unused" }),
            }),
          });

          expect(writeCalls).toEqual([
            {
              path: "packages/domain/src/Api.ts",
              contents: "export const Api = {};\n",
              writeMode: "override",
            },
          ]);
          expect(result).toMatchObject({
            created: [],
            modified: ["packages/domain/src/Api.ts"],
            skipped: [],
            failed: [],
          });
        }),
    );

    it.effect(
      "should merge structural create outcomes with missing contents and then write merged output",
      () =>
        Effect.gen(function* () {
          const writeCalls: Array<ApplyWriteRequest> = [];
          const mergeCalls: Array<StructuralMergeInput> = [];

          const result = yield* runApply({
            apply: makeApply({
              outcomes: [
                partialOutcome({
                  path: "packages/domain/src/index.ts",
                  classification: "create",
                  requiredStructure: {
                    reExports: ["./Api"],
                  },
                }),
              ],
            }),
            layer: makeApplyServiceLayer({
              entries: {
                "/repo/packages/domain/src/index.ts": { _tag: "missing" },
              },
              write: ({ write }) => {
                writeCalls.push(write);
                return Effect.succeed({
                  path: write.path,
                  status: "created" as const,
                });
              },
              merge: (input) => {
                mergeCalls.push(input);
                return Effect.succeed({
                  path: input.path,
                  contents: 'export * from "./Api";\n',
                });
              },
            }),
          });

          expect(mergeCalls).toHaveLength(1);
          const firstMergeCall = mergeCalls[0];
          assert(firstMergeCall !== undefined);
          expect(Option.isNone(firstMergeCall.existing)).toBe(true);
          expect(firstMergeCall).toMatchObject({
            path: "packages/domain/src/index.ts",
            mode: "create",
          });
          expect(writeCalls).toEqual([
            {
              path: "packages/domain/src/index.ts",
              contents: 'export * from "./Api";\n',
              writeMode: "create",
            },
          ]);
          expect(result).toMatchObject({
            created: ["packages/domain/src/index.ts"],
            modified: [],
            skipped: [],
            failed: [],
          });
        }),
    );

    it.effect(
      "should merge structural modify outcomes with existing file contents",
      () =>
        Effect.gen(function* () {
          const mergeCalls: Array<StructuralMergeInput> = [];

          const result = yield* runApply({
            apply: makeApply({
              outcomes: [
                partialOutcome({
                  path: "packages/domain/src/index.ts",
                  classification: "modify",
                  requiredStructure: {
                    reExports: ["./Api"],
                  },
                }),
              ],
            }),
            layer: makeApplyServiceLayer({
              entries: {
                "/repo/packages/domain/src/index.ts": {
                  _tag: "file",
                  contents: 'export * from "./Existing";\n',
                },
              },
              write: ({ write }) =>
                Effect.succeed({
                  path: write.path,
                  status: "modified" as const,
                }),
              merge: (input) => {
                mergeCalls.push(input);
                return Effect.succeed({
                  path: input.path,
                  contents: 'export * from "./Api";\n',
                });
              },
            }),
          });

          expect(mergeCalls).toHaveLength(1);
          const firstMergeCall = mergeCalls[0];
          assert(firstMergeCall !== undefined);
          expect(Option.isSome(firstMergeCall.existing)).toBe(true);
          expect(Option.getOrUndefined(firstMergeCall.existing)).toBe(
            'export * from "./Existing";\n',
          );
          expect(result).toMatchObject({
            created: [],
            modified: ["packages/domain/src/index.ts"],
            skipped: [],
            failed: [],
          });
        }),
    );

    it.effect(
      "should fail when structural inputs resolve to a directory and then stop applying",
      () =>
        Effect.gen(function* () {
          const writeCalls: Array<ApplyWriteRequest> = [];

          const exit = yield* Effect.exit(
            runApply({
              apply: makeApply({
                outcomes: [
                  partialOutcome({
                    path: "packages/domain/src/index.ts",
                    classification: "modify",
                    requiredStructure: {
                      reExports: ["./Api"],
                    },
                  }),
                ],
              }),
              layer: makeApplyServiceLayer({
                entries: {
                  "/repo/packages/domain/src/index.ts": {
                    _tag: "directory",
                  },
                },
                write: ({ write }) => {
                  writeCalls.push(write);
                  return Effect.succeed({
                    path: write.path,
                    status: "modified" as const,
                  });
                },
                merge: (input) =>
                  Effect.succeed({ path: input.path, contents: "unused" }),
              }),
            }),
          );

          expect(Exit.isFailure(exit)).toBe(true);
          assert(Exit.isFailure(exit));
          expect(writeCalls).toHaveLength(0);
          expect(Cause.squash(exit.cause)).toMatchObject({
            _tag: "ApplyFailure",
            reason: "repoRootInvalid",
            message:
              "Expected /repo/packages/domain/src/index.ts to be a file during apply.",
          });
        }),
    );

    it.effect(
      "should fail when structural file reads fail and then stop applying",
      () =>
        Effect.gen(function* () {
          const writeCalls: Array<ApplyWriteRequest> = [];

          const exit = yield* Effect.exit(
            runApply({
              apply: makeApply({
                outcomes: [
                  partialOutcome({
                    path: "packages/domain/src/index.ts",
                    classification: "modify",
                    requiredStructure: {
                      reExports: ["./Api"],
                    },
                  }),
                ],
              }),
              layer: makeApplyServiceLayer({
                entries: {
                  "/repo/packages/domain/src/index.ts": {
                    _tag: "readError",
                    error: PlatformError.systemError({
                      _tag: "Unknown",
                      module: "FileSystem",
                      method: "readFileString",
                      description: "read exploded",
                      pathOrDescriptor: "/repo/packages/domain/src/index.ts",
                    }),
                  },
                },
                write: ({ write }) => {
                  writeCalls.push(write);
                  return Effect.succeed({
                    path: write.path,
                    status: "modified" as const,
                  });
                },
                merge: (input) =>
                  Effect.succeed({ path: input.path, contents: "unused" }),
              }),
            }),
          );

          expect(Exit.isFailure(exit)).toBe(true);
          assert(Exit.isFailure(exit));
          expect(writeCalls).toHaveLength(0);
          expect(Cause.squash(exit.cause)).toMatchObject({
            _tag: "ApplyFailure",
            reason: "repoRootInvalid",
            message:
              "Could not read /repo/packages/domain/src/index.ts during apply: Unknown: FileSystem.readFileString (/repo/packages/domain/src/index.ts): read exploded",
          });
        }),
    );

    it.effect("should map unchanged write outcomes into skipped paths", () =>
      Effect.gen(function* () {
        const result = yield* runApply({
          apply: makeApply({
            outcomes: [
              completeOutcome({
                path: "packages/domain/src/Api.ts",
                classification: "modify",
                contents: "export const Api = {};\n",
              }),
            ],
          }),
          layer: makeApplyServiceLayer({
            write: ({ write }) =>
              Effect.succeed({
                path: write.path,
                status: "unchanged" as const,
              }),
            merge: (input) =>
              Effect.succeed({ path: input.path, contents: "unused" }),
          }),
        });

        expect(result).toMatchObject({
          created: [],
          modified: [],
          skipped: ["packages/domain/src/Api.ts"],
          failed: [],
        });
      }),
    );

    it.effect(
      "should collect write failures and then continue applying remaining writes",
      () =>
        Effect.gen(function* () {
          const writeCalls: Array<ApplyWriteRequest> = [];

          const result = yield* runApply({
            apply: makeApply({
              outcomes: [
                completeOutcome({
                  path: "packages/domain/src/Api.ts",
                  classification: "create",
                  contents: "api",
                }),
                completeOutcome({
                  path: "packages/domain/src/index.ts",
                  classification: "create",
                  contents: "index",
                }),
              ],
            }),
            layer: makeApplyServiceLayer({
              write: ({ write }) => {
                writeCalls.push(write);

                if (write.path === "packages/domain/src/Api.ts") {
                  return Effect.fail(new Error("disk full"));
                }

                return Effect.succeed({
                  path: write.path,
                  status: "created" as const,
                });
              },
              merge: (input) =>
                Effect.succeed({ path: input.path, contents: "unused" }),
            }),
          });

          expect(writeCalls).toHaveLength(2);
          expect(result).toMatchObject({
            created: ["packages/domain/src/index.ts"],
            modified: [],
            skipped: [],
            failed: [
              {
                path: "packages/domain/src/Api.ts",
                reason: "disk full",
              },
            ],
          });
        }),
    );

    it.effect(
      "should return sorted apply result collections after mixed outcomes",
      () =>
        Effect.gen(function* () {
          const result = yield* runApply({
            apply: makeApply({
              outcomes: [
                completeOutcome({
                  path: "z.ts",
                  classification: "create",
                  contents: "z",
                }),
                completeOutcome({
                  path: "b.ts",
                  classification: "create",
                  contents: "b",
                }),
                completeOutcome({
                  path: "y.ts",
                  classification: "modify",
                  contents: "y",
                }),
                completeOutcome({
                  path: "a.ts",
                  classification: "modify",
                  contents: "a",
                }),
                completeOutcome({
                  path: "x.ts",
                  classification: "unchanged",
                  contents: "x",
                }),
                completeOutcome({
                  path: "c.ts",
                  classification: "modify",
                  contents: "c",
                }),
                completeOutcome({
                  path: "d.ts",
                  classification: "conflict",
                  contents: "d",
                }),
              ],
              decisions: [
                {
                  path: "d.ts",
                  value: "skip",
                },
              ],
            }),
            layer: makeApplyServiceLayer({
              write: ({ write }) => {
                switch (write.path) {
                  case "z.ts":
                  case "b.ts":
                    return Effect.succeed({
                      path: write.path,
                      status: "created" as const,
                    });
                  case "y.ts":
                  case "a.ts":
                    return Effect.succeed({
                      path: write.path,
                      status: "modified" as const,
                    });
                  case "c.ts":
                    return Effect.succeed({
                      path: write.path,
                      status: "unchanged" as const,
                    });
                  default:
                    return Effect.fail(
                      new Error(`Unexpected write path ${write.path}`),
                    );
                }
              },
              merge: (input) =>
                Effect.succeed({ path: input.path, contents: "unused" }),
            }),
          });

          expect(result).toMatchObject({
            created: ["b.ts", "z.ts"],
            modified: ["a.ts", "y.ts"],
            skipped: ["c.ts", "d.ts", "x.ts"],
            failed: [],
          });
        }),
    );
  });
});
