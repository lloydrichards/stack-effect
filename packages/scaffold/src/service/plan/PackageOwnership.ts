import { Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { PackageTargetPath } from "@repo/domain/Catalog";
import { PlanFailure } from "@repo/domain/Plan";
import { Array as Arr, Effect, FileSystem, Path, Schema } from "effect";

export type PackageOwner = {
  readonly path: string;
  readonly name: string;
};

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
    Effect.map(({ name }) => ({
      path: manifestPath.slice(0, -"/package.json".length),
      name,
    })),
    Effect.mapError(() =>
      unsupported(manifestPath, "invalid package JSON or missing name"),
    ),
  );

/** Discover eligible package owners below packages without following symlinks. */
export const discoverPackageOwners = Effect.fn("PackageOwnership.discover")(
  function* (repoRoot: string) {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const inspect = (relative: string) =>
      Effect.gen(function* () {
        const absolute = paths.join(repoRoot, relative);
        const stat = yield* fs.stat(absolute).pipe(
          Effect.catchTag("PlatformError", (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(null)
              : Effect.fail(error),
          ),
          Effect.mapError(() => unsupported(relative, "could not stat entry")),
        );
        const link = yield* fs.readLink(absolute).pipe(
          Effect.map(() => true),
          Effect.orElseSucceed(() => false),
        );
        if (link)
          return yield* Effect.fail(
            unsupported(relative, "symbolic links are unsupported"),
          );
        return stat;
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
          return yield* Effect.fail(
            unsupported(relative, "expected directory"),
          );
        const names = yield* fs
          .readDirectory(paths.join(repoRoot, relative))
          .pipe(
            Effect.mapError(() =>
              unsupported(relative, "could not list directory"),
            ),
          );
        const manifestAlias = names.find(
          (name) =>
            name.toLowerCase() === "package.json" && name !== "package.json",
        );
        if (manifestAlias !== undefined)
          return yield* unsupported(
            `${relative}/${manifestAlias}`,
            "package manifests must use the canonical package.json filename",
          );
        const manifest = names.includes("package.json")
          ? yield* Effect.gen(function* () {
              const manifestPath = `${relative}/package.json`;
              const fileStat = yield* inspect(manifestPath);
              if (fileStat?.type !== "File")
                return yield* Effect.fail(
                  unsupported(manifestPath, "expected regular file"),
                );
              const text = yield* fs
                .readFileString(paths.join(repoRoot, manifestPath))
                .pipe(
                  Effect.mapError(() =>
                    unsupported(manifestPath, "could not read manifest"),
                  ),
                );
              return [yield* parsePackageOwner(manifestPath, text)];
            })
          : [];
        const candidates = names
          .filter(
            (name) =>
              name !== "package.json" &&
              !name.startsWith(".") &&
              name.toLowerCase() !== "node_modules",
          )
          .sort();
        const children = yield* Effect.forEach(candidates, (name) =>
          Effect.gen(function* () {
            const child = `${relative}/${name}`;
            const entry = yield* inspect(child);
            return entry?.type === "Directory" ? yield* visit(child) : [];
          }),
        );
        return [...manifest, ...children.flat()];
      });
    const owners = yield* visit("packages");
    yield* Effect.forEach(owners, (owner, index) =>
      Effect.forEach(owners.slice(index + 1), (other) =>
        owner.name === other.name || aliases(owner.path, other.path)
          ? Effect.fail(
              unsupported(
                owner.path,
                `ambiguous owners at ${owner.path} and ${other.path}`,
              ),
            )
          : Effect.void,
      ),
    );
    return owners;
  },
);

const aliases = (left: string, right: string) => {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
};

export const validatePackageOwners = (
  blueprint: typeof Blueprint.Type,
  existing: ReadonlyArray<PackageOwner>,
) =>
  Effect.gen(function* () {
    const proposed = Arr.filter(blueprint.nodes, BlueprintNode.guards.target)
      .filter((node) => node.identity.kind === "package")
      .map((node) => ({
        path: node.path ?? node.identity.toPath(),
        name: node.identity.toPackageName(),
      }));
    yield* Effect.forEach(proposed, ({ path }) =>
      Schema.decodeEffect(PackageTargetPath)(path).pipe(
        Effect.mapError(() =>
          unsupported(path, "unsupported native package destination"),
        ),
      ),
    );
    const all = [...existing, ...proposed];
    yield* Effect.forEach(proposed, (owner, index) =>
      Effect.forEach(all, (other, otherIndex) => {
        if (otherIndex === existing.length + index) return Effect.void;
        if (owner.name === other.name && owner.path === other.path)
          return Effect.void;
        if (owner.name === other.name || aliases(owner.path, other.path))
          return Effect.fail(
            new PlanFailure({
              reason: "repoStateUnsupported",
              message: `Package ${owner.name} at ${owner.path} overlaps or relocates ${other.name} at ${other.path}.`,
            }),
          );
        return Effect.void;
      }),
    );
  });
