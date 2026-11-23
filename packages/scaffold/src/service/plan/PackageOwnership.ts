import { Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { targetPathsOverlap } from "@repo/domain/Catalog";
import { pathOrd } from "@repo/domain/Order";
import { type PackageOwner, PlanFailure } from "@repo/domain/Plan";
import { Array as Arr, Effect, Schema } from "effect";

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
      path: manifestPath.slice(0, -"/package.json".length),
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

/** Reject owners whose names or directories would collide. */
export const assertDistinctOwners = (owners: ReadonlyArray<PackageOwner>) =>
  Effect.forEach(owners, (owner, index) =>
    Effect.forEach(owners.slice(index + 1), (other) =>
      owner.name.toLowerCase() === other.name.toLowerCase() ||
      targetPathsOverlap(owner.path, other.path)
        ? Effect.fail(
            ownershipFailure(
              owner.path,
              `ambiguous owners ${owner.name} at ${owner.path} and ${other.name} at ${other.path}`,
            ),
          )
        : Effect.void,
    ),
  );

export const validatePackageOwners = (
  blueprint: typeof Blueprint.Type,
  existing: ReadonlyArray<PackageOwner>,
) =>
  Effect.gen(function* () {
    const proposed = Arr.filter(blueprint.nodes, BlueprintNode.guards.target)
      .filter((node) => node.identity.kind !== "workspace")
      .map((node): PackageOwner => ({
        path: node.identity.toPath(),
        name: node.identity.toPackageName(),
      }));
    yield* assertDistinctOwners(proposed);
    yield* Effect.forEach(proposed, (owner) =>
      Effect.forEach(existing, (other) =>
        owner.path === other.path &&
        owner.name.toLowerCase() === other.name.toLowerCase()
          ? Effect.void
          : owner.name.toLowerCase() === other.name.toLowerCase() ||
              targetPathsOverlap(owner.path, other.path)
            ? Effect.fail(
                ownershipFailure(
                  owner.path,
                  `package ${owner.name} overlaps or relocates ${other.name} at ${other.path}`,
                ),
              )
            : Effect.void,
      ),
    );
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

/** Validate final root manifests together, before Apply can write any file. */
export const prepareOwnerWrites = (
  existing: ReadonlyArray<PackageOwner>,
  writes: ReadonlyArray<{ readonly path: string; readonly contents: string }>,
) =>
  Effect.gen(function* () {
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
    yield* Effect.forEach(ownerWrites, (owner) => {
      const previous = existing.find((other) => other.path === owner.path);
      return previous !== undefined && previous.name !== owner.name
        ? Effect.fail(
            ownershipFailure(
              owner.path,
              `cannot change owner ${previous.name} to ${owner.name}`,
            ),
          )
        : Effect.void;
    });
    const finalOwners = [
      ...existing.filter(
        (owner) => !ownerWrites.some((write) => write.path === owner.path),
      ),
      ...ownerWrites,
    ].sort(pathOrd);
    yield* assertDistinctOwners(finalOwners);
    return ownerWrites;
  });
