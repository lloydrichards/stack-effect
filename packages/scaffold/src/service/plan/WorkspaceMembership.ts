import { PlanFailure, PlanOutcome, type RepoSnapshot } from "@repo/domain/Plan";
import { Effect, Schema } from "effect";
import { isSeq, parseDocument } from "yaml";
import { isRootManifest } from "./PackageOwnership";

export const workspaceManifestPaths = [
  "package.json",
  "deno.json",
  "pnpm-workspace.yaml",
];
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

/** Register package roots using the same stop-at-owner boundary as repository discovery. */
export const registerWorkspaceMembers = Effect.fn(
  "WorkspaceMembership.register",
)(function* (
  outcomes: ReadonlyArray<typeof PlanOutcome.Type>,
  snapshot: typeof RepoSnapshot.Type,
  existingOwners: ReadonlyArray<string>,
) {
  const candidates = [
    ...existingOwners,
    ...outcomes
      .map((outcome) => outcome.path)
      .filter((path) => path.endsWith("/package.json"))
      .map((path) => path.slice(0, -"/package.json".length)),
  ];
  const members = [
    ...new Set(
      candidates.filter((path) =>
        isRootManifest(`${path}/package.json`, candidates),
      ),
    ),
  ].sort();
  const existingFiles = new Map(
    snapshot.paths
      .filter((entry) => entry._tag === "file")
      .map((entry) => [entry.path, entry.contents]),
  );
  const registered = yield* Effect.forEach(workspaceManifestPaths, (path) =>
    Effect.gen(function* () {
      const outcome = outcomes.find((entry) => entry.path === path);
      const existing = existingFiles.get(path);
      const seed =
        outcome?._tag === "complete" ? outcome.contents : outcome?.seedContents;
      const contents =
        outcome?._tag === "complete" && outcome.classification === "conflict"
          ? seed
          : (existing ?? seed);
      if (contents === undefined) return outcome;
      if (path === "pnpm-workspace.yaml") {
        const document = parseDocument(contents);
        if (document.errors.length > 0)
          return yield* new PlanFailure({
            reason: "repoStateUnsupported",
            message: `Invalid pnpm-workspace.yaml: ${document.errors.map((error) => error.message).join("; ")}`,
          });
        const sequence = document.get("packages", true);
        const entries = yield* Schema.decodeUnknownEffect(
          Schema.Array(Schema.String),
        )(isSeq(sequence) ? sequence.toJSON() : undefined).pipe(
          Effect.mapError(
            () =>
              new PlanFailure({
                reason: "repoStateUnsupported",
                message: "Expected a packages sequence in pnpm-workspace.yaml.",
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
      }
      const object = yield* Schema.decodeEffect(jsonObject)(contents).pipe(
        Effect.mapError(
          (cause) =>
            new PlanFailure({
              reason: "repoStateUnsupported",
              message: `Could not read workspace membership in ${path}: ${cause.message}`,
            }),
        ),
      );
      const field =
        path === "deno.json" ? ("workspace" as const) : ("workspaces" as const);
      if (object[field] === undefined) return outcome;
      const entries = yield* Schema.decodeUnknownEffect(
        Schema.Array(Schema.String),
      )(object[field]).pipe(
        Effect.mapError(
          () =>
            new PlanFailure({
              reason: "repoStateUnsupported",
              message: `Expected ${field} to be an array of paths in ${path}.`,
            }),
        ),
      );
      const paths = mergeMembers(entries, members);
      if (outcome?._tag === "complete") {
        const updated = `${yield* Schema.encodeEffect(jsonObject)({ ...object, [field]: paths }).pipe(Effect.mapError((cause) => new PlanFailure({ reason: "invalidPlanIntent", message: cause.message })))}\n`;
        return {
          ...outcome,
          contents: updated,
          classification: membershipClassification(
            existing,
            updated,
            outcome?.classification,
          ),
        };
      }
      const changed = !sameMembers(entries, paths);
      if (!changed) return outcome;
      const operation = {
        _tag: "json-workspace-members" as const,
        fileType: "json" as const,
        field,
        members: paths,
      };
      return {
        _tag: "composed" as const,
        path,
        seedContents: outcome?.seedContents,
        operations: [
          ...(outcome?._tag === "composed" ? outcome.operations : []),
          operation,
        ],
        classification:
          outcome?.classification === "conflict"
            ? ("conflict" as const)
            : existing === undefined
              ? ("create" as const)
              : ("modify" as const),
      };
    }),
  );
  return [
    ...outcomes.filter(
      (outcome) => !workspaceManifestPaths.includes(outcome.path),
    ),
    ...registered.filter((outcome) => outcome !== undefined),
  ];
});

const mergeMembers = (
  entries: ReadonlyArray<string>,
  members: ReadonlyArray<string>,
) =>
  [
    ...new Set([
      ...entries.filter((entry) => !generatedGlobs.has(entry)),
      ...members,
    ]),
  ].sort();
const sameMembers = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
) =>
  left.length === right.length &&
  left.every((entry, index) => entry === right[index]);

const membershipClassification = (
  existing: string | undefined,
  updated: string,
  classification?: (typeof PlanOutcome.Type)["classification"],
) =>
  classification === "conflict"
    ? ("conflict" as const)
    : existing === undefined
      ? ("create" as const)
      : existing === updated
        ? ("unchanged" as const)
        : ("modify" as const);
