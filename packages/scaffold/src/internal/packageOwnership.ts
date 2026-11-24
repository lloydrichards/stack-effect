import { Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { targetPathsOverlap } from "@repo/domain/Catalog";
import {
  type PackageOwner,
  PlanFailure,
  RepositoryPath,
  byPath,
} from "@repo/domain/Plan";
import { Array as Arr, Effect, Equivalence, Option, Schema } from "effect";

/**
 * Package names and path segments that differ only in case name the same
 * package on case-insensitive filesystems and registries.
 *
 * @internal
 */
export const CaseInsensitive = Equivalence.mapInput(
  Equivalence.String,
  (value: string) => value.toLowerCase(),
);

const ManifestName = Schema.fromJsonString(
  Schema.Struct({ name: Schema.NonEmptyString }),
);

/** @internal */
export const parsePackageOwner = (manifestPath: string, contents: string) =>
  Schema.decodeEffect(ManifestName)(contents).pipe(
    Effect.map(({ name }): PackageOwner => ({
      path: RepositoryPath.make(manifestPath.slice(0, -"/package.json".length)),
      name,
    })),
    Effect.mapError(
      (cause) =>
        new PlanFailure({
          message: `Cannot inspect package ownership at ${manifestPath}: invalid package JSON or missing name`,
          cause,
        }),
    ),
  );

// Reject owners whose names or directories would collide.
/** @internal */
export const assertDistinctOwners = Effect.fnUntraced(function* (
  owners: ReadonlyArray<PackageOwner>,
) {
  const collision = Arr.findFirst(owners, (owner, index) =>
    Arr.findFirst(
      owners.slice(index + 1),
      (other) =>
        CaseInsensitive(owner.name, other.name) ||
        targetPathsOverlap(owner.path, other.path),
    ).pipe(Option.map((other) => ({ owner, other }))),
  );
  if (Option.isSome(collision)) {
    const { owner, other } = collision.value;
    return yield* new PlanFailure({
      message: `Cannot inspect package ownership at ${owner.path}: ambiguous owners ${owner.name} at ${owner.path} and ${other.name} at ${other.path}`,
    });
  }
});

/** @internal */
export const validatePackageOwners = Effect.fnUntraced(function* (
  blueprint: Blueprint,
  existing: ReadonlyArray<PackageOwner>,
) {
  const proposed = blueprint.nodes
    .filter(BlueprintNode.guards.target)
    .filter((node) => node.identity.kind !== "workspace")
    .map((node): PackageOwner => ({
      path: RepositoryPath.make(node.identity.toPath()),
      name: node.identity.toPackageName(),
    }));
  yield* assertDistinctOwners(proposed);

  const relocation = Arr.findFirst(proposed, (owner) =>
    Arr.findFirst(existing, (other) => {
      const sameName = CaseInsensitive(owner.name, other.name);
      if (owner.path === other.path && sameName) return false;
      return sameName || targetPathsOverlap(owner.path, other.path);
    }).pipe(Option.map((other) => ({ owner, other }))),
  );
  if (Option.isSome(relocation)) {
    const { owner, other } = relocation.value;
    return yield* new PlanFailure({
      message: `Cannot inspect package ownership at ${owner.path}: package ${owner.name} overlaps or relocates ${other.name} at ${other.path}`,
    });
  }
});

const isOwnedBy = (root: string, owner: string) => {
  const rootSegments = root.split("/");
  const ownerSegments = owner.split("/");
  return (
    ownerSegments.length < rootSegments.length &&
    Arr.makeEquivalence(CaseInsensitive)(
      ownerSegments,
      rootSegments.slice(0, ownerSegments.length),
    )
  );
};

/** @internal */
export const isRootManifest = (
  manifestPath: string,
  ownerPaths: ReadonlyArray<string>,
) => {
  const segments = manifestPath.split("/");
  const root = manifestPath.slice(0, -"/package.json".length);
  return (
    (segments[0] === "apps" || segments[0] === "packages") &&
    segments.length >= 3 &&
    segments.at(-1) === "package.json" &&
    segments
      .slice(1, -1)
      .every(
        (segment) =>
          !segment.startsWith(".") && !CaseInsensitive(segment, "node_modules"),
      ) &&
    !ownerPaths.some((owner) => isOwnedBy(root, owner))
  );
};

// Validate final root manifests together, before Apply can write any file.
/** @internal */
export const prepareOwnerWrites = Effect.fnUntraced(function* (
  existing: ReadonlyArray<PackageOwner>,
  writes: ReadonlyArray<{ readonly path: string; readonly contents: string }>,
) {
  const candidatePaths = [
    ...existing.map((owner) => owner.path),
    ...writes
      .filter((write) =>
        isRootManifest(
          write.path,
          existing.map((owner) => owner.path),
        ),
      )
      .map((write) => write.path.slice(0, -"/package.json".length)),
  ];
  const ownerWrites = yield* Effect.forEach(
    writes.filter((write) => isRootManifest(write.path, candidatePaths)),
    (write) => parsePackageOwner(write.path, write.contents),
  );
  for (const owner of ownerWrites) {
    const previous = existing.find((other) => other.path === owner.path);
    if (previous !== undefined && previous.name !== owner.name) {
      return yield* new PlanFailure({
        message: `Cannot inspect package ownership at ${owner.path}: cannot change owner ${previous.name} to ${owner.name}`,
      });
    }
  }
  const finalOwners = [
    ...existing.filter(
      (owner) => !ownerWrites.some((write) => write.path === owner.path),
    ),
    ...ownerWrites,
  ].sort(byPath);
  yield* assertDistinctOwners(finalOwners);
  return ownerWrites;
});
