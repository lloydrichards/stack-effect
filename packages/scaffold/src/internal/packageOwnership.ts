import type { CatalogReader } from "@repo/catalog/Catalog";
import { Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { type TargetIdentity, targetPathsOverlap } from "@repo/domain/Catalog";
import {
  type PackageOwner,
  PlanError,
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
    Effect.flatMap(({ name }) =>
      Schema.decodeEffect(RepositoryPath)(
        manifestPath.slice(0, -"/package.json".length),
      ).pipe(Effect.map((path): PackageOwner => ({ path, name }))),
    ),
    Effect.mapError(
      (cause) =>
        new PlanError({
          message: `Cannot inspect package ownership at ${manifestPath}: invalid package path or manifest`,
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
    return yield* new PlanError({
      message: `Cannot inspect package ownership at ${owner.path}: ambiguous owners ${owner.name} at ${owner.path} and ${other.name} at ${other.path}`,
    });
  }
});

/** @internal */
export const packagePath = (
  identity: TargetIdentity,
  defaultName: string | undefined,
  owners: ReadonlyArray<PackageOwner>,
): RepositoryPath =>
  identity.kind === "workspace"
    ? identity.toPath()
    : (owners.find(({ name }) => name === identity.toPackageName())?.path ??
      identity.toPath(defaultName));

/** @internal */
export const resolvePackagePaths = Effect.fnUntraced(function* (
  blueprint: Blueprint,
  existing: ReadonlyArray<PackageOwner>,
  catalog: CatalogReader["Service"],
) {
  const targets = blueprint.nodes.filter(BlueprintNode.guards.target);
  const locations = yield* Effect.forEach(targets, ({ id, identity }) =>
    Effect.map(catalog.getTarget(identity.kind), ({ defaultName }) => ({
      id,
      kind: identity.kind,
      name: identity.toPackageName(),
      path: packagePath(identity, defaultName, existing),
    })),
  );
  const proposed = locations.filter(({ kind }) => kind !== "workspace");
  yield* assertDistinctOwners(proposed);

  const conflict = Arr.findFirst(proposed, (owner) =>
    Arr.findFirst(existing, (other) => {
      const sameName = CaseInsensitive(owner.name, other.name);
      if (owner.path === other.path && owner.name === other.name) return false;
      return sameName || targetPathsOverlap(owner.path, other.path);
    }).pipe(Option.map((other) => ({ owner, other }))),
  );
  if (Option.isSome(conflict)) {
    const { owner, other } = conflict.value;
    return yield* new PlanError({
      message: `Cannot inspect package ownership at ${owner.path}: package ${owner.name} conflicts with ${other.name} at ${other.path}`,
    });
  }
  return new Map(locations.map(({ id, path }) => [id, path]));
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
      return yield* new PlanError({
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
