import {
  Apply,
  ApplyError,
  ApplyResult,
  type StalePlanChange,
  StalePlan,
} from "@repo/domain/Apply";
import {
  CompositionOperation,
  type PackageOwner,
  type PlanBaseline,
  type PlanBaselinePath,
  RepositoryPath,
  byPath,
} from "@repo/domain/Plan";
import { Array as Arr, Data, Effect, Match, Option, Schema } from "effect";
import type { Applier } from "../Apply";
import {
  AtomicWriter,
  type RepositoryFiles,
  WriteAttempt,
  WriteMode,
  WriteRequest,
} from "./atomicWriter";
import * as Composition from "./composition";
import { prepareOwnerWrites } from "./packageOwnership";
import { type Repository, RepositoryState } from "./repositoryState";

const MaterializedPlannedOutcomeAction = Schema.TaggedUnion({
  skip: {
    path: RepositoryPath,
    reason: Schema.Literals(["unchanged", "decision"]),
  },
  "write-authoritative": {
    path: RepositoryPath,
    contents: Schema.String,
    writeMode: WriteMode,
  },
  "write-composed": {
    path: RepositoryPath,
    seedContents: Schema.Union([Schema.String, Schema.Undefined]),
    operations: Schema.Array(CompositionOperation),
    writeMode: WriteMode,
  },
});

type MaterializedPlannedOutcomeAction =
  typeof MaterializedPlannedOutcomeAction.Type;

type WriteComposedAction = Extract<
  MaterializedPlannedOutcomeAction,
  { readonly _tag: "write-composed" }
>;

type PreparedApplyAction = Data.TaggedEnum<{
  skip: { path: RepositoryPath };
  write: { request: WriteRequest };
}>;

const PreparedApplyAction = Data.taggedEnum<PreparedApplyAction>();

// Writes in execution order: owner manifests first, so package boundaries exist before
// files inside them are published.
type WriteBatch = {
  baseline: PlanBaseline;
  writes: ReadonlyArray<WriteRequest>;
  skipped: ReadonlyArray<RepositoryPath>;
  owners: ReadonlyArray<PackageOwner>;
};

const emptyResult = new ApplyResult({
  created: [],
  modified: [],
  skipped: [],
  failed: [],
});

const manifestPathOf = (owner: PackageOwner) => `${owner.path}/package.json`;

const toWriteRequest = (
  writeMode: WriteMode,
  path: RepositoryPath,
  contents: string,
) =>
  writeMode === "create"
    ? WriteRequest.create({ path, contents })
    : WriteRequest.replace({ path, contents, reason: writeMode });

const stalePlanMessage = (
  changes: ReadonlyArray<StalePlanChange>,
  partialResult: ApplyResult,
) => {
  const written = [...partialResult.created, ...partialResult.modified];
  return `Repository changed since planning: ${changes.map((change) => `${change.path} (${change.kind})`).join(", ")}. ${written.length > 0 ? `Already written: ${written.join(", ")}. ` : ""}Replan and try again.`;
};

const makeWriteBatch = (
  baseline: PlanBaseline,
  prepared: ReadonlyArray<PreparedApplyAction>,
  owners: ReadonlyArray<PackageOwner>,
): WriteBatch => {
  const writes = prepared
    .filter(PreparedApplyAction.$is("write"))
    .map(({ request }) => request);
  const ownerManifestPaths = new Set(owners.map(manifestPathOf));
  return {
    baseline,
    writes: [
      ...writes.filter((write) => ownerManifestPaths.has(write.path)),
      ...writes.filter((write) => !ownerManifestPaths.has(write.path)),
    ],
    skipped: prepared
      .filter(PreparedApplyAction.$is("skip"))
      .map(({ path }) => path),
    owners,
  };
};

const pathsOf = (attempts: ReadonlyArray<{ readonly path: RepositoryPath }>) =>
  attempts.map(({ path }) => path);

const toApplyResult = (
  batch: WriteBatch,
  attempts: ReadonlyArray<WriteAttempt>,
) =>
  new ApplyResult({
    created: pathsOf(attempts.filter(WriteAttempt.$is("created"))),
    modified: pathsOf(attempts.filter(WriteAttempt.$is("modified"))),
    skipped: Arr.dedupe([
      ...batch.skipped,
      ...pathsOf(attempts.filter(WriteAttempt.$is("unchanged"))),
    ]),
    failed: attempts
      .filter(WriteAttempt.$is("failed"))
      .map(({ path, reason }) => ({ path, reason })),
  }).toSorted();

const relevantBaseline = (
  baseline: PlanBaseline,
  filePath: RepositoryPath,
  createdDirectories: ReadonlySet<RepositoryPath>,
  expectedOwners: PlanBaseline["packageOwners"],
): PlanBaseline => ({
  root: baseline.root,
  packageOwners: expectedOwners,
  paths: baseline.paths
    .filter(
      (entry) =>
        entry.path === "." ||
        entry.path === filePath ||
        filePath.startsWith(`${entry.path}/`),
    )
    .map((entry): PlanBaselinePath =>
      createdDirectories.has(entry.path)
        ? { _tag: "directory", path: entry.path }
        : entry,
    ),
});

const missingAncestors = (baseline: PlanBaseline, filePath: RepositoryPath) =>
  baseline.paths
    .filter(
      (entry) =>
        entry._tag === "missing" &&
        (entry.path === "." || filePath.startsWith(`${entry.path}/`)),
    )
    .map((entry) => entry.path);

const materializeFrom = (apply: Apply) => {
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
};

/** @internal */
export const makeApplier = Effect.gen(function* () {
  const atomicWriter = yield* AtomicWriter;
  const repositoryState = yield* RepositoryState;

  const loadComposedBaseContents = Effect.fnUntraced(function* (
    action: WriteComposedAction,
    files: RepositoryFiles,
  ) {
    const existingContents =
      action.writeMode === "modify"
        ? yield* files.read(action.path)
        : Option.none<string>();

    if (Option.isSome(existingContents)) {
      return existingContents.value;
    }

    if (action.seedContents !== undefined) {
      return action.seedContents;
    }

    const fallbackContents = yield* files.read(action.path);
    return Option.getOrElse(fallbackContents, () =>
      action.path.endsWith(".json") ? "{}" : "",
    );
  });

  const prepareComposedWrite = Effect.fnUntraced(function* (
    action: WriteComposedAction,
    files: RepositoryFiles,
  ) {
    // NOTE: Modify composes from disk first so repeat applies preserve unrelated fields.
    const baseContents = yield* loadComposedBaseContents(action, files);
    const composedContents = yield* Composition.compose(
      action.path,
      baseContents,
      action.operations,
    );

    return PreparedApplyAction.write({
      request: toWriteRequest(action.writeMode, action.path, composedContents),
    });
  });

  const prepare = (
    action: MaterializedPlannedOutcomeAction,
    files: RepositoryFiles,
  ): Effect.Effect<PreparedApplyAction, ApplyError> =>
    Match.valueTags(action, {
      skip: ({ path }) => Effect.succeed(PreparedApplyAction.skip({ path })),
      "write-authoritative": ({ path, contents, writeMode }) =>
        Effect.succeed(
          PreparedApplyAction.write({
            request: toWriteRequest(writeMode, path, contents),
          }),
        ),
      "write-composed": (composed) => prepareComposedWrite(composed, files),
    });

  const verifyBaseline = Effect.fnUntraced(function* (
    repository: Repository,
    baseline: PlanBaseline,
  ) {
    const changes = yield* repository.verify(baseline);
    if (changes.length > 0) {
      return yield* new StalePlan({
        changes,
        partialResult: emptyResult,
        message: stalePlanMessage(changes, emptyResult),
      });
    }
  });

  const validateOwnerWrites = Effect.fnUntraced(function* (
    repository: Repository,
    baseline: PlanBaseline,
    prepared: ReadonlyArray<PreparedApplyAction>,
  ) {
    const existing =
      baseline.packageOwners ??
      (yield* repository.discoverOwners.pipe(
        Effect.mapError(
          (error) =>
            new ApplyError({
              message: error.message,
              cause: error,
            }),
        ),
      ));
    return yield* prepareOwnerWrites(
      existing,
      prepared
        .filter(PreparedApplyAction.$is("write"))
        .map(({ request }) => request),
    ).pipe(
      Effect.mapError(
        (error) =>
          new ApplyError({
            message: error.message,
            cause: error,
          }),
      ),
    );
  });

  const executeWrites = Effect.fnUntraced(function* (
    batch: WriteBatch,
    repository: Repository,
    files: RepositoryFiles,
  ) {
    const attempts: Array<WriteAttempt> = [];
    const createdDirectories = new Set<RepositoryPath>();
    let expectedOwners = batch.baseline.packageOwners;

    // Each write rechecks only its own baseline entries, against the owners and
    // directories that earlier writes in this batch produced.
    for (const request of batch.writes) {
      const changes = yield* repository.verify(
        relevantBaseline(
          batch.baseline,
          request.path,
          createdDirectories,
          expectedOwners,
        ),
      );
      if (changes.length > 0) {
        const partialResult = toApplyResult(batch, attempts);
        return yield* new StalePlan({
          changes,
          partialResult,
          message: stalePlanMessage(changes, partialResult),
        });
      }

      const attempt = yield* files
        .write(
          request,
          Effect.sync(() =>
            missingAncestors(batch.baseline, request.path).forEach((path) =>
              createdDirectories.add(path),
            ),
          ),
        )
        .pipe(
          Effect.catch((error) =>
            Effect.succeed(
              WriteAttempt.failed({
                path: request.path,
                reason: error.message,
              }),
            ),
          ),
        );
      attempts.push(attempt);

      const owner = batch.owners.find(
        (candidate) => manifestPathOf(candidate) === request.path,
      );
      if (
        expectedOwners !== undefined &&
        owner !== undefined &&
        (attempt._tag === "created" || attempt._tag === "modified")
      ) {
        expectedOwners = [
          ...expectedOwners.filter((existing) => existing.path !== owner.path),
          owner,
        ].sort(byPath);
      }
    }
    return attempts;
  });

  const apply = Effect.fn("Applier.apply")(function* ({
    apply: input,
    repositoryRoot,
  }: {
    apply: Apply;
    repositoryRoot: string;
  }) {
    // A structural `{ plan, decisions }` type-checks as Apply without the
    // decision checks, and a missing decision would then override a conflict.
    // Rebuilding runs them; a value that fails is a defect in the caller.
    const applyIntent = yield* Effect.sync(
      () => new Apply({ plan: input.plan, decisions: input.decisions }),
    );
    const repository = repositoryState.at(repositoryRoot);
    const files = atomicWriter.at(repositoryRoot);
    const { baseline } = applyIntent.plan;

    const actions = materializeFrom(applyIntent);
    yield* verifyBaseline(repository, baseline);

    const prepared = yield* Effect.forEach(actions, (action) =>
      prepare(action, files),
    );
    yield* verifyBaseline(repository, baseline);

    const owners = yield* validateOwnerWrites(repository, baseline, prepared);
    const batch = makeWriteBatch(baseline, prepared, owners);
    const attempts = yield* executeWrites(batch, repository, files);

    return toApplyResult(batch, attempts);
  });

  return { apply } satisfies Applier["Service"];
});
