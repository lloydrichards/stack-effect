import { Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { targetPathsOverlap } from "@repo/domain/Catalog";
import { pathOrd } from "@repo/domain/Order";
import {
  type PackageOwner,
  PlanFailure,
  RepositoryPath,
} from "@repo/domain/Plan";
import { Effect, Schema } from "effect";

export const ownershipFailure = (
  path: string,
  detail: string,
  cause?: unknown,
) =>
  new PlanFailure({
    message: `Cannot inspect package ownership at ${path}: ${detail}`,
    cause,
  });

const ManifestName = Schema.fromJsonString(
  Schema.Struct({ name: Schema.NonEmptyString }),
);

export const parsePackageOwner = (manifestPath: string, contents: string) =>
  Schema.decodeEffect(ManifestName)(contents).pipe(
    Effect.map(({ name }): PackageOwner => ({
      path: RepositoryPath.make(manifestPath.slice(0, -"/package.json".length)),
      name,
    })),
    Effect.mapError((cause) =>
      ownershipFailure(
        manifestPath,
        "invalid package JSON or missing name",
        cause,
      ),
    ),
  );

// Reject owners whose names or directories would collide.
export const assertDistinctOwners = Effect.fnUntraced(function* (
  owners: ReadonlyArray<PackageOwner>,
) {
  for (const [index, owner] of owners.entries()) {
    for (const other of owners.slice(index + 1)) {
      if (
        owner.name.toLowerCase() === other.name.toLowerCase() ||
        targetPathsOverlap(owner.path, other.path)
      ) {
        return yield* ownershipFailure(
          owner.path,
          `ambiguous owners ${owner.name} at ${owner.path} and ${other.name} at ${other.path}`,
        );
      }
    }
  }
});

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

  for (const owner of proposed) {
    for (const other of existing) {
      const sameName = owner.name.toLowerCase() === other.name.toLowerCase();
      if (owner.path === other.path && sameName) continue;
      if (sameName || targetPathsOverlap(owner.path, other.path)) {
        return yield* ownershipFailure(
          owner.path,
          `package ${owner.name} overlaps or relocates ${other.name} at ${other.path}`,
        );
      }
    }
  }
});

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
          !segment.startsWith(".") && segment.toLowerCase() !== "node_modules",
      ) &&
    !ownerPaths.some((owner) =>
      root.toLowerCase().startsWith(`${owner.toLowerCase()}/`),
    )
  );
};

// Validate final root manifests together, before Apply can write any file.
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
      return yield* ownershipFailure(
        owner.path,
        `cannot change owner ${previous.name} to ${owner.name}`,
      );
    }
  }
  const finalOwners = [
    ...existing.filter(
      (owner) => !ownerWrites.some((write) => write.path === owner.path),
    ),
    ...ownerWrites,
  ].sort(pathOrd);
  yield* assertDistinctOwners(finalOwners);
  return ownerWrites;
});
