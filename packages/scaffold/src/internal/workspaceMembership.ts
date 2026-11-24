import {
  type PlanEntryClassification,
  PlanError,
  PlanOutcome,
  type RepoSnapshot,
  RepositoryPath,
} from "@repo/domain/Plan";
import { Array as Arr, Effect, Equivalence, Order, Schema } from "effect";
import { isSeq, parseDocument } from "yaml";
import { isRootManifest } from "./packageOwnership";

/** @internal */
export const workspaceManifestPaths = [
  "package.json",
  "deno.json",
  "pnpm-workspace.yaml",
].map((path) => RepositoryPath.make(path));
const jsonObject = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Json),
  { space: 2 },
);
const generatedGlobs = new Set([
  "apps/*",
  "packages/*",
  "apps/**",
  "packages/**",
]);

const mergeMembers = (
  entries: ReadonlyArray<string>,
  members: ReadonlyArray<string>,
) =>
  [
    ...new Set([
      ...entries.filter((entry) => !generatedGlobs.has(entry)),
      ...members,
    ]),
  ].sort(Order.String);
const sameMembers = Arr.makeEquivalence(Equivalence.String);

const membershipClassification = (
  existing: string | undefined,
  updated: string,
  classification?: PlanEntryClassification,
): PlanEntryClassification => {
  if (classification === "conflict") return "conflict";
  if (existing === undefined) return "create";
  return existing === updated ? "unchanged" : "modify";
};

// A workspace manifest whose membership list is being updated.
type Manifest = {
  path: RepositoryPath;
  outcome: PlanOutcome | undefined;
  existing: string | undefined;
  contents: string;
};

const registerPnpmWorkspace = Effect.fnUntraced(function* (
  manifest: Manifest,
  members: ReadonlyArray<string>,
) {
  const { path, outcome, existing, contents } = manifest;
  const document = parseDocument(contents);
  if (document.errors.length > 0)
    return yield* new PlanError({
      message: `Invalid pnpm-workspace.yaml: ${document.errors.map((error) => error.message).join("; ")}`,
      cause: document.errors,
    });
  const sequence = document.get("packages", true);
  const entries = yield* Schema.decodeUnknownEffect(
    Schema.Array(Schema.String),
  )(isSeq(sequence) ? sequence.toJSON() : undefined).pipe(
    Effect.mapError(
      (cause) =>
        new PlanError({
          message: "Expected a packages sequence in pnpm-workspace.yaml.",
          cause,
        }),
    ),
  );
  const paths = mergeMembers(entries, members);
  if (!sameMembers(entries, paths)) document.set("packages", paths);
  const updated = document.toString();
  return PlanOutcome.cases.complete.make({
    path,
    contents: updated,
    classification: membershipClassification(
      existing,
      updated,
      outcome?.classification,
    ),
  });
});

const registerJsonWorkspaces = Effect.fnUntraced(function* (
  manifest: Manifest,
  members: ReadonlyArray<string>,
) {
  const { path, outcome, existing, contents } = manifest;
  const object = yield* Schema.decodeEffect(jsonObject)(contents).pipe(
    Effect.mapError(
      (cause) =>
        new PlanError({
          message: `Could not read workspace membership in ${path}`,
          cause,
        }),
    ),
  );
  const field = path === "deno.json" ? "workspace" : "workspaces";
  if (object[field] === undefined) return outcome;
  const entries = yield* Schema.decodeUnknownEffect(
    Schema.Array(Schema.String),
  )(object[field]).pipe(
    Effect.mapError(
      (cause) =>
        new PlanError({
          message: `Expected ${field} to be an array of paths in ${path}.`,
          cause,
        }),
    ),
  );
  const paths = mergeMembers(entries, members);
  if (outcome?._tag === "complete") {
    const encoded = yield* Schema.encodeEffect(jsonObject)({
      ...object,
      [field]: paths,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new PlanError({ message: `Could not encode ${path}`, cause }),
      ),
    );
    const updated = `${encoded}\n`;
    return {
      ...outcome,
      contents: updated,
      classification: membershipClassification(
        existing,
        updated,
        outcome.classification,
      ),
    };
  }
  if (sameMembers(entries, paths)) return outcome;
  const membershipChange = existing === undefined ? "create" : "modify";
  return PlanOutcome.cases.composed.make({
    path,
    seedContents: outcome?.seedContents,
    operations: [
      ...(outcome?._tag === "composed" ? outcome.operations : []),
      {
        _tag: "json-workspace-members",
        fileType: "json",
        field,
        members: paths,
      },
    ],
    classification:
      outcome?.classification === "conflict" ? "conflict" : membershipChange,
  });
});

const registerManifest = Effect.fnUntraced(function* (
  path: RepositoryPath,
  outcome: PlanOutcome | undefined,
  existing: string | undefined,
  members: ReadonlyArray<string>,
) {
  const seed =
    outcome?._tag === "complete" ? outcome.contents : outcome?.seedContents;
  const contents =
    outcome?._tag === "complete" && outcome.classification === "conflict"
      ? seed
      : (existing ?? seed);
  if (contents === undefined) return outcome;
  const manifest = { path, outcome, existing, contents };
  return path === "pnpm-workspace.yaml"
    ? yield* registerPnpmWorkspace(manifest, members)
    : yield* registerJsonWorkspaces(manifest, members);
});

// Register package roots using the same stop-at-owner boundary as repository discovery.
/** @internal */
export const registerWorkspaceMembers = Effect.fnUntraced(function* (
  outcomes: ReadonlyArray<PlanOutcome>,
  snapshot: RepoSnapshot,
  existingOwners: ReadonlyArray<RepositoryPath>,
) {
  const candidates = [
    ...existingOwners,
    ...outcomes
      .map((outcome) => outcome.path)
      .filter((path) => path.endsWith("/package.json"))
      .map((path) =>
        RepositoryPath.make(path.slice(0, -"/package.json".length)),
      ),
  ];
  const members = [
    ...new Set(
      candidates.filter((path) =>
        isRootManifest(`${path}/package.json`, candidates),
      ),
    ),
  ].sort(Order.String);
  const existingFiles = new Map(
    snapshot.paths
      .filter((entry) => entry._tag === "file")
      .map((entry) => [entry.path, entry.contents]),
  );

  const registered = yield* Effect.forEach(workspaceManifestPaths, (path) =>
    registerManifest(
      path,
      outcomes.find((entry) => entry.path === path),
      existingFiles.get(path),
      members,
    ),
  );
  return [
    ...outcomes.filter(
      (outcome) => !workspaceManifestPaths.includes(outcome.path),
    ),
    ...registered.filter((outcome) => outcome !== undefined),
  ];
});
