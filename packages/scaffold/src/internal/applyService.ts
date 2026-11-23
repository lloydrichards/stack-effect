import {
  type Apply,
  type ApplyFailedPath,
  ApplyFailure,
  ApplyResult,
  type StalePlanChange,
  StalePlanFailure,
} from "@repo/domain/Apply";
import { pathOrd } from "@repo/domain/Order";
import {
  CompositionOperation,
  type PackageOwner,
  RepositoryPath,
} from "@repo/domain/Plan";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Match,
  Option,
  Path,
  Schema,
} from "effect";
import type { ApplyService } from "../ApplyService";
import { type ApplyWriteRequest, AtomicWriter } from "./atomicWriter";
import * as Composition from "./composition";
import { prepareOwnerWrites } from "./packageOwnership";
import { RepositoryState } from "./repositoryState";

const MaterializedPlannedOutcomeAction = Schema.TaggedUnion({
  skip: {
    path: RepositoryPath,
    reason: Schema.Literals(["unchanged", "decision"]),
  },
  "write-authoritative": {
    path: RepositoryPath,
    contents: Schema.String,
    writeMode: Schema.Literals(["create", "modify", "override"]),
  },
  "write-composed": {
    path: RepositoryPath,
    seedContents: Schema.Union([Schema.String, Schema.Undefined]),
    operations: Schema.Array(CompositionOperation),
    writeMode: Schema.Literals(["create", "modify", "override"]),
  },
});

type MaterializedPlannedOutcomeAction =
  typeof MaterializedPlannedOutcomeAction.Type;

type WriteComposedAction = Extract<
  MaterializedPlannedOutcomeAction,
  { readonly _tag: "write-composed" }
>;

const PreparedApplyAction = Schema.TaggedUnion({
  skip: {
    path: RepositoryPath,
  },
  write: {
    request: Schema.Struct({
      path: RepositoryPath,
      contents: Schema.String,
      writeMode: Schema.Literals(["create", "modify", "override"]),
    }),
  },
});

type PreparedApplyAction = typeof PreparedApplyAction.Type;

type WriteAttempt =
  | {
      readonly path: RepositoryPath;
      readonly status: "created" | "modified" | "unchanged";
    }
  | {
      readonly path: RepositoryPath;
      readonly status: "failure";
      readonly reason: string;
    };

const stalePlanMessage = (
  changes: ReadonlyArray<StalePlanChange>,
  partialResult: ApplyResult,
) => {
  const written = [...partialResult.created, ...partialResult.modified];
  return `Repository changed since planning: ${changes.map((change) => `${change.path} (${change.kind})`).join(", ")}. ${written.length > 0 ? `Already written: ${written.join(", ")}. ` : ""}Replan and try again.`;
};

const toApplyResult = ({
  skippedPaths,
  writeAttempts,
}: {
  skippedPaths: ReadonlySet<RepositoryPath>;
  writeAttempts: ReadonlyArray<WriteAttempt>;
}) => {
  const created: Array<RepositoryPath> = [];
  const modified: Array<RepositoryPath> = [];
  const skipped = new Set(skippedPaths);
  const failed: Array<ApplyFailedPath> = [];
  for (const writeAttempt of writeAttempts) {
    switch (writeAttempt.status) {
      case "created":
        created.push(writeAttempt.path);
        break;
      case "modified":
        modified.push(writeAttempt.path);
        break;
      case "unchanged":
        skipped.add(writeAttempt.path);
        break;
      case "failure":
        failed.push({ path: writeAttempt.path, reason: writeAttempt.reason });
        break;
    }
  }

  return new ApplyResult({
    created,
    modified,
    skipped: [...skipped],
    failed,
  }).toSorted();
};

const validateApplyIntent = Effect.fnUntraced(function* (apply: Apply) {
  const baselinePaths = new Set(
    apply.plan.baseline.paths.map((entry) => entry.path),
  );
  const uncoveredOutcome = Arr.findFirst(
    apply.plan.outcomes,
    (outcome) => !baselinePaths.has(outcome.path),
  );
  if (Option.isSome(uncoveredOutcome)) {
    return yield* new ApplyFailure({
      message: `Plan baseline does not cover ${uncoveredOutcome.value.path}.`,
    });
  }
  const conflictPaths = new Set(
    apply.plan.outcomes
      .filter((outcome) => outcome.classification === "conflict")
      .map((outcome) => outcome.path),
  );

  const seenDecisionPaths = new Set<string>();
  const duplicateDecision = Arr.findFirst(apply.decisions, (decision) => {
    if (seenDecisionPaths.has(decision.path)) {
      return true;
    }
    seenDecisionPaths.add(decision.path);
    return false;
  });
  if (Option.isSome(duplicateDecision)) {
    return yield* new ApplyFailure({
      message: `Duplicate apply decision for ${duplicateDecision.value.path}.`,
    });
  }

  const extraDecision = Arr.findFirst(
    apply.decisions,
    (decision) => !conflictPaths.has(decision.path),
  );
  if (Option.isSome(extraDecision)) {
    return yield* new ApplyFailure({
      message: `Unexpected apply decision for non-conflicted path ${extraDecision.value.path}.`,
    });
  }

  const decisionPaths = new Set(
    apply.decisions.map((decision) => decision.path),
  );
  const missingDecisionPath = Arr.findFirst(
    [...conflictPaths],
    (conflictPath) => !decisionPaths.has(conflictPath),
  );
  if (Option.isSome(missingDecisionPath)) {
    return yield* new ApplyFailure({
      message: `Missing apply decision for conflicted path ${missingDecisionPath.value}.`,
    });
  }
});

const materializeFrom = Effect.fnUntraced(function* (apply: Apply) {
  yield* validateApplyIntent(apply);

  const decisionsByPath = new Map(
    apply.decisions.map((decision) => [decision.path, decision.value] as const),
  );
  return apply.plan.outcomes.map((outcome): MaterializedPlannedOutcomeAction =>
    Match.value(outcome).pipe(
      Match.withReturnType<MaterializedPlannedOutcomeAction>(),
      Match.when({ classification: "unchanged" }, (o) =>
        MaterializedPlannedOutcomeAction.cases.skip.make({
          path: o.path,
          reason: o.classification,
        }),
      ),
      Match.whenOr(
        { classification: "create" },
        { classification: "modify" },
        (o) =>
          Match.valueTags(o, {
            complete: (n) =>
              MaterializedPlannedOutcomeAction.cases[
                "write-authoritative"
              ].make({
                path: n.path,
                contents: n.contents,
                writeMode: n.classification,
              }),
            composed: (n) =>
              MaterializedPlannedOutcomeAction.cases["write-composed"].make({
                path: n.path,
                seedContents: n.seedContents,
                operations: n.operations,
                writeMode: n.classification,
              }),
          }),
      ),
      Match.when({ classification: "conflict" }, (o) => {
        if (decisionsByPath.get(outcome.path) === "skip") {
          return MaterializedPlannedOutcomeAction.cases.skip.make({
            path: o.path,
            reason: "decision",
          });
        }
        return Match.valueTags(o, {
          complete: (n) =>
            MaterializedPlannedOutcomeAction.cases["write-authoritative"].make({
              path: n.path,
              contents: n.contents,
              writeMode: "override",
            }),
          composed: (n) =>
            MaterializedPlannedOutcomeAction.cases["write-composed"].make({
              path: n.path,
              seedContents: n.seedContents,
              operations: n.operations,
              writeMode: "override",
            }),
        });
      }),
      Match.exhaustive,
    ),
  );
});

/** @internal */
export const make = Effect.gen(function* () {
  const atomicWriter = yield* AtomicWriter;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repositoryState = yield* RepositoryState;

  const loadFileContents = Effect.fnUntraced(function* (filePath: string) {
    const pathStat = yield* fileSystem.stat(filePath).pipe(
      Effect.asSome,
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeedNone),
      Effect.mapError(
        (error) =>
          new ApplyFailure({
            message: `Could not inspect ${filePath} during apply: ${error.message}`,
            cause: error,
          }),
      ),
    );

    if (Option.isNone(pathStat)) {
      return Option.none<string>();
    }

    if (pathStat.value.type === "Directory") {
      return yield* new ApplyFailure({
        message: `Expected ${filePath} to be a file during apply.`,
      });
    }

    const contents = yield* fileSystem.readFileString(filePath).pipe(
      Effect.mapError(
        (error) =>
          new ApplyFailure({
            message: `Could not read ${filePath} during apply: ${error.message}`,
            cause: error,
          }),
      ),
    );

    return Option.some(contents);
  });

  const loadComposedBaseContents = Effect.fnUntraced(function* (
    action: WriteComposedAction,
    repositoryRoot: string,
  ) {
    const fullPath = path.join(repositoryRoot, action.path);
    const existingContents =
      action.writeMode === "modify"
        ? yield* loadFileContents(fullPath)
        : Option.none<string>();

    if (Option.isSome(existingContents)) {
      return existingContents.value;
    }

    if (action.seedContents !== undefined) {
      return action.seedContents;
    }

    const fallbackContents = yield* loadFileContents(fullPath);
    return Option.getOrElse(fallbackContents, () =>
      action.path.endsWith(".json") ? "{}" : "",
    );
  });

  const prepareComposedWrite = Effect.fnUntraced(function* (
    action: WriteComposedAction,
    repositoryRoot: string,
  ) {
    // NOTE: Modify composes from disk first so repeat applies preserve unrelated fields.
    const baseContents = yield* loadComposedBaseContents(
      action,
      repositoryRoot,
    );
    const composedContents = yield* Composition.compose(
      action.path,
      baseContents,
      action.operations,
    );

    return PreparedApplyAction.cases.write.make({
      request: {
        path: action.path,
        contents: composedContents,
        writeMode: action.writeMode,
      },
    });
  });

  const prepare = (
    action: MaterializedPlannedOutcomeAction,
    repositoryRoot: string,
  ): Effect.Effect<PreparedApplyAction, ApplyFailure> =>
    Match.valueTags(action, {
      skip: ({ path }) =>
        Effect.succeed(PreparedApplyAction.cases.skip.make({ path })),
      "write-authoritative": ({ path, contents, writeMode }) =>
        Effect.succeed(
          PreparedApplyAction.cases.write.make({
            request: { path, contents, writeMode },
          }),
        ),
      "write-composed": (composed) =>
        prepareComposedWrite(composed, repositoryRoot),
    });

  const prepareWrites = Effect.fnUntraced(function* (
    actions: ReadonlyArray<MaterializedPlannedOutcomeAction>,
    repositoryRoot: string,
  ) {
    const preparedActions = yield* Effect.forEach(actions, (action) =>
      prepare(action, repositoryRoot),
    );

    const skippedPaths = new Set<RepositoryPath>();
    const writeRequests: Array<ApplyWriteRequest> = [];
    for (const preparedAction of preparedActions) {
      Match.valueTags(preparedAction, {
        skip: ({ path }) => skippedPaths.add(path),
        write: ({ request }) => writeRequests.push(request),
      });
    }
    return { skippedPaths, writeRequests };
  });

  const executeWrites = Effect.fnUntraced(function* ({
    repositoryRoot,
    writeRequests,
    applyIntent,
    skippedPaths,
    ownerWrites,
  }: {
    ownerWrites: ReadonlyArray<PackageOwner>;
    repositoryRoot: string;
    writeRequests: ReadonlyArray<ApplyWriteRequest>;
    applyIntent: Apply;
    skippedPaths: ReadonlySet<RepositoryPath>;
  }) {
    const attempts: Array<WriteAttempt> = [];
    const createdDirectories = new Set<string>();
    let expectedOwners = applyIntent.plan.baseline.packageOwners;
    const recordCreatedDirectories = (filePath: string) =>
      applyIntent.plan.baseline.paths
        .filter(
          (entry) =>
            entry._tag === "missing" &&
            (entry.path === "." || filePath.startsWith(`${entry.path}/`)),
        )
        .forEach((entry) => createdDirectories.add(entry.path));
    const ownerManifestPaths = new Set(
      ownerWrites.map((owner) => `${owner.path}/package.json`),
    );
    // Establish package boundaries before publishing fixture manifests inside them.
    const orderedWrites = [
      ...writeRequests.filter((write) => ownerManifestPaths.has(write.path)),
      ...writeRequests.filter((write) => !ownerManifestPaths.has(write.path)),
    ];

    for (const writeRequest of orderedWrites) {
      const relevantPaths = applyIntent.plan.baseline.paths
        .filter(
          (entry) =>
            entry.path === "." ||
            entry.path === writeRequest.path ||
            writeRequest.path.startsWith(`${entry.path}/`),
        )
        .map((entry) => entry.path);
      const changes = yield* repositoryState.verify({
        baseline: {
          root: applyIntent.plan.baseline.root,
          packageOwners: expectedOwners,
          paths: applyIntent.plan.baseline.paths.map((entry) =>
            createdDirectories.has(entry.path)
              ? { _tag: "directory" as const, path: entry.path }
              : entry,
          ),
        },
        repositoryRoot,
        paths: relevantPaths,
      });
      if (changes.length > 0) {
        const partialResult = toApplyResult({
          skippedPaths,
          writeAttempts: attempts,
        });
        return yield* new StalePlanFailure({
          changes,
          partialResult,
          message: stalePlanMessage(changes, partialResult),
        });
      }

      const attempt = yield* atomicWriter
        .write({
          repositoryRoot,
          write: writeRequest,
          onParentDirectoryReady: Effect.sync(() =>
            recordCreatedDirectories(writeRequest.path),
          ),
        })
        .pipe(
          Effect.catch((error) =>
            Effect.succeed({
              path: writeRequest.path,
              status: "failure" as const,
              reason: error.message,
            }),
          ),
        );
      attempts.push(attempt);

      if (attempt.status === "created" || attempt.status === "modified") {
        recordCreatedDirectories(writeRequest.path);
        const owner = ownerWrites.find(
          (candidate) => `${candidate.path}/package.json` === writeRequest.path,
        );
        if (expectedOwners !== undefined && owner !== undefined) {
          expectedOwners = [
            ...expectedOwners.filter(
              (existing) => existing.path !== owner.path,
            ),
            owner,
          ].sort(pathOrd);
        }
      }
    }
    return attempts;
  });

  const validateBaseline = Effect.fnUntraced(function* (
    applyIntent: Apply,
    repositoryRoot: string,
  ) {
    const changes = yield* repositoryState.verify({
      baseline: applyIntent.plan.baseline,
      repositoryRoot,
    });
    if (changes.length > 0) {
      const partialResult = new ApplyResult({
        created: [],
        modified: [],
        skipped: [],
        failed: [],
      });
      return yield* new StalePlanFailure({
        changes,
        partialResult,
        message: stalePlanMessage(changes, partialResult),
      });
    }
  });

  const validateOwnerWrites = Effect.fnUntraced(function* (
    applyIntent: Apply,
    repositoryRoot: string,
    writes: ReadonlyArray<ApplyWriteRequest>,
  ) {
    const existing =
      applyIntent.plan.baseline.packageOwners ??
      (yield* repositoryState.discoverOwners(repositoryRoot).pipe(
        Effect.mapError(
          (error) =>
            new ApplyFailure({
              message: error.message,
              cause: error,
            }),
        ),
      ));
    return yield* prepareOwnerWrites(existing, writes).pipe(
      Effect.mapError(
        (error) =>
          new ApplyFailure({
            message: error.message,
            cause: error,
          }),
      ),
    );
  });

  const apply = Effect.fn("ApplyService.apply")(function* ({
    apply: applyIntent,
    repositoryRoot,
  }: {
    apply: Apply;
    repositoryRoot: string;
  }) {
    const actions = yield* materializeFrom(applyIntent);
    yield* validateBaseline(applyIntent, repositoryRoot);

    const { skippedPaths, writeRequests } = yield* prepareWrites(
      actions,
      repositoryRoot,
    );
    yield* validateBaseline(applyIntent, repositoryRoot);

    const ownerWrites = yield* validateOwnerWrites(
      applyIntent,
      repositoryRoot,
      writeRequests,
    );
    const writeAttempts = yield* executeWrites({
      ownerWrites,
      repositoryRoot,
      writeRequests,
      applyIntent,
      skippedPaths,
    });

    return toApplyResult({ skippedPaths, writeAttempts });
  });

  return { apply } satisfies ApplyService["Service"];
});
