import { Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { targetPathsOverlap } from "@repo/domain/Catalog";
import { pathOrd } from "@repo/domain/Order";
import { type PackageOwner, PlanFailure } from "@repo/domain/Plan";
import { Array as Arr, Effect, FileSystem, Path, Schema } from "effect";

const unsupported = (path: string, detail: string) =>
  new PlanFailure({
    reason: "repoStateUnsupported",
    message: `Cannot inspect package ownership at ${path}: ${detail}`,
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
    Effect.mapError(() =>
      unsupported(manifestPath, "invalid package JSON or missing name"),
    ),
  );

const validateOwners = (owners: ReadonlyArray<PackageOwner>) =>
  Effect.forEach(owners, (owner, index) =>
    Effect.forEach(owners.slice(index + 1), (other) =>
      owner.name.toLowerCase() === other.name.toLowerCase() ||
      targetPathsOverlap(owner.path, other.path)
        ? Effect.fail(
            unsupported(
              owner.path,
              `ambiguous owners ${owner.name} at ${owner.path} and ${other.name} at ${other.path}`,
            ),
          )
        : Effect.void,
    ),
  );

/** Discover roots through grouping directories; package contents are not owners. */
export const discoverPackageOwners = Effect.fn("PackageOwnership.discover")(
  function* (repoRoot: string) {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const inspect = (relative: string) =>
      Effect.gen(function* () {
        const absolute = paths.join(repoRoot, relative);
        const link = yield* fs.readLink(absolute).pipe(
          Effect.map(() => true),
          Effect.orElseSucceed(() => false),
        );
        if (link)
          return yield* unsupported(relative, "symbolic links are unsupported");
        return yield* fs.stat(absolute).pipe(
          Effect.catchTag("PlatformError", (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(null)
              : Effect.fail(error),
          ),
          Effect.mapError(() => unsupported(relative, "could not stat entry")),
        );
      });

    const visit = (
      relative: string,
    ): Effect.Effect<
      ReadonlyArray<PackageOwner>,
      PlanFailure,
      FileSystem.FileSystem | Path.Path
    > =>
      Effect.gen(function* () {
        const stat = yield* inspect(relative);
        if (stat === null) return [];
        if (stat.type !== "Directory")
          return yield* unsupported(relative, "expected directory");
        const names = yield* fs
          .readDirectory(paths.join(repoRoot, relative))
          .pipe(
            Effect.mapError(() =>
              unsupported(relative, "could not list directory"),
            ),
          );
        const alias = names.find(
          (name) =>
            name.toLowerCase() === "package.json" && name !== "package.json",
        );
        if (alias !== undefined)
          return yield* unsupported(
            `${relative}/${alias}`,
            "package manifests must use the canonical package.json filename",
          );
        if (names.includes("package.json")) {
          const manifestPath = `${relative}/package.json`;
          const fileStat = yield* inspect(manifestPath);
          if (fileStat?.type !== "File")
            return yield* unsupported(manifestPath, "expected regular file");
          const contents = yield* fs
            .readFileString(paths.join(repoRoot, manifestPath))
            .pipe(
              Effect.mapError(() =>
                unsupported(manifestPath, "could not read manifest"),
              ),
            );
          return [yield* parsePackageOwner(manifestPath, contents)];
        }
        const candidates = names
          .filter(
            (name) =>
              !name.startsWith(".") && name.toLowerCase() !== "node_modules",
          )
          .sort();
        const children = yield* Effect.forEach(candidates, (name) =>
          Effect.gen(function* () {
            const child = `${relative}/${name}`;
            const entry = yield* inspect(child);
            return entry?.type === "Directory" ? yield* visit(child) : [];
          }),
        );
        return children.flat();
      });
    const owners = (yield* Effect.forEach(["apps", "packages"], visit))
      .flat()
      .sort(pathOrd);
    yield* validateOwners(owners);
    return owners;
  },
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
    yield* validateOwners(proposed);
    yield* Effect.forEach(proposed, (owner) =>
      Effect.forEach(existing, (other) =>
        owner.path === other.path &&
        owner.name.toLowerCase() === other.name.toLowerCase()
          ? Effect.void
          : owner.name.toLowerCase() === other.name.toLowerCase() ||
              targetPathsOverlap(owner.path, other.path)
            ? Effect.fail(
                unsupported(
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
            unsupported(
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
    yield* validateOwners(finalOwners);
    return ownerWrites;
  });
