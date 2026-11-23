import { pathOrd } from "@repo/domain/Order";
import {
  type PackageOwner,
  type PlanBaseline,
  type PlanBaselinePath,
  PlanFailure,
  type RepoSnapshot,
} from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
} from "effect";
import * as Digest from "effect/crypto/Digest";
import {
  assertDistinctOwners,
  ownershipFailure,
  parsePackageOwner,
} from "./PackageOwnership";

export type RepositoryChange = {
  readonly path: string;
  readonly kind:
    | "created"
    | "deleted"
    | "modified"
    | "typeChanged"
    | "rootChanged";
};

/** The fingerprinted baseline of a capture and the text contents it was taken from. */
export type RepositoryCapture = {
  readonly baseline: typeof PlanBaseline.Type;
  readonly snapshot: typeof RepoSnapshot.Type;
};

type SnapshotEntry = typeof RepoSnapshot.fields.paths.value.Type;

const sameOwners = (
  expected: ReadonlyArray<PackageOwner>,
  actual: ReadonlyArray<PackageOwner>,
) =>
  expected.length === actual.length &&
  expected.every(
    (owner, index) =>
      owner.path === actual[index]?.path && owner.name === actual[index]?.name,
  );

/** List how `actual` differs from `expected`, by path and change kind. */
export const compare = (
  expected: typeof PlanBaseline.Type,
  actual: typeof PlanBaseline.Type,
): ReadonlyArray<RepositoryChange> => {
  const actualByPath = new Map(
    actual.paths.map((entry) => [entry.path, entry] as const),
  );
  return [
    ...(expected.root === actual.root
      ? []
      : [{ path: ".", kind: "rootChanged" as const }]),
    ...(expected.packageOwners === undefined ||
    (actual.packageOwners !== undefined &&
      sameOwners(expected.packageOwners, actual.packageOwners))
      ? []
      : [{ path: ".", kind: "modified" as const }]),
    ...expected.paths.flatMap((entry): ReadonlyArray<RepositoryChange> => {
      const current = actualByPath.get(entry.path);
      if (current === undefined) return [{ path: entry.path, kind: "deleted" }];
      if (entry._tag === current._tag) {
        return entry._tag === "file" &&
          current._tag === "file" &&
          entry.sha256 !== current.sha256
          ? [{ path: entry.path, kind: "modified" }]
          : [];
      }
      if (entry._tag === "missing")
        return [{ path: entry.path, kind: "created" }];
      if (current._tag === "missing")
        return [{ path: entry.path, kind: "deleted" }];
      return [{ path: entry.path, kind: "typeChanged" }];
    }),
  ];
};

export class RepositoryState extends Context.Service<RepositoryState>()(
  "@repo/scaffold/RepositoryState",
  {
    make: Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Digest.Digest;

      const statOption = (absolutePath: string) =>
        fileSystem.stat(absolutePath).pipe(
          Effect.asSome,
          Effect.catchReason(
            "PlatformError",
            "NotFound",
            () => Effect.succeedNone,
          ),
        );
      const lstatOption = (absolutePath: string) =>
        fileSystem.lstat(absolutePath).pipe(
          Effect.asSome,
          Effect.catchReason(
            "PlatformError",
            "NotFound",
            () => Effect.succeedNone,
          ),
        );

      // Resolve through the nearest existing ancestor so a root that does not exist yet keeps its identity.
      const canonicalRoot = Effect.fnUntraced(function* (repoRoot: string) {
        const absoluteRoot = path.resolve(repoRoot);
        let current = absoluteRoot;
        const suffix: Array<string> = [];

        while (true) {
          const resolved = yield* fileSystem.realPath(current).pipe(
            Effect.asSome,
            Effect.catchReason(
              "PlatformError",
              "NotFound",
              () => Effect.succeedNone,
            ),
            Effect.mapError(
              (cause) =>
                new PlanFailure({
                  message: "Could not resolve the repository root.",
                  cause,
                }),
            ),
          );
          if (Option.isSome(resolved)) {
            return path.join(resolved.value, ...suffix.reverse());
          }
          const parent = path.dirname(current);
          if (parent === current) {
            return absoluteRoot;
          }
          suffix.push(path.basename(current));
          current = parent;
        }
      });

      const readEntry = Effect.fnUntraced(function* (
        repoRoot: string,
        snapshotPath: string,
      ) {
        const absolutePath = path.join(repoRoot, snapshotPath);
        const symbolicLink = new PlanFailure({
          message: `Symbolic link in repository path ${snapshotPath} is unsupported.`,
        });
        const inspectFailure = (cause: { readonly message: string }) =>
          new PlanFailure({
            message: `Could not inspect ${snapshotPath} during planning: ${cause.message}`,
            cause,
          });

        const entry = yield* lstatOption(absolutePath).pipe(
          Effect.mapError(inspectFailure),
        );
        if (Option.isNone(entry)) {
          return {
            _tag: "missing",
            path: snapshotPath,
          } satisfies SnapshotEntry;
        }

        let info = entry.value;
        if (info.type === "SymbolicLink") {
          // A link may only alias the repository root itself, and it must resolve.
          if (snapshotPath !== ".") return yield* symbolicLink;
          const target = yield* statOption(absolutePath).pipe(
            Effect.mapError(inspectFailure),
          );
          if (Option.isNone(target)) return yield* symbolicLink;
          info = target.value;
        }

        if (info.type === "Directory") {
          return {
            _tag: "directory",
            path: snapshotPath,
          } satisfies SnapshotEntry;
        }

        if (info.type !== "File") {
          return yield* new PlanFailure({
            message: `Unsupported repository entry at ${snapshotPath}: ${info.type}.`,
          });
        }

        const bytes = yield* fileSystem.readFile(absolutePath).pipe(
          Effect.mapError(
            (cause) =>
              new PlanFailure({
                message: `Could not read ${snapshotPath} during planning: ${cause.message}`,
                cause,
              }),
          ),
        );

        if (bytes.includes(0)) {
          return yield* new PlanFailure({
            message: `Non-text repository file at ${snapshotPath} is unsupported.`,
          });
        }

        const contents = yield* Effect.try({
          try: () =>
            new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
              bytes,
            ),
          catch: (cause) =>
            new PlanFailure({
              message: `Non-text repository file at ${snapshotPath} is unsupported.`,
              cause,
            }),
        });

        return {
          _tag: "file",
          path: snapshotPath,
          contents,
        } satisfies SnapshotEntry;
      });

      const readSnapshot = Effect.fnUntraced(function* (
        repoRoot: string,
        paths: ReadonlyArray<string>,
      ) {
        const snapshotPaths = Arr.fromIterable(new Set(paths)).sort(
          Order.String,
        );
        const entries = yield* Effect.forEach(snapshotPaths, (snapshotPath) =>
          readEntry(repoRoot, snapshotPath),
        );
        return { paths: entries } satisfies typeof RepoSnapshot.Type;
      });

      const fingerprint = (snapshot: typeof RepoSnapshot.Type) =>
        Effect.forEach(snapshot.paths, (entry) =>
          entry._tag === "file"
            ? crypto
                .digestHex(
                  Digest.sha256,
                  new TextEncoder().encode(entry.contents),
                )
                .pipe(
                  Effect.map((sha256): typeof PlanBaselinePath.Type => ({
                    _tag: "file",
                    path: entry.path,
                    sha256,
                  })),
                )
            : Effect.succeed(entry satisfies typeof PlanBaselinePath.Type),
        );

      /** Discover roots through grouping directories; package contents are not owners. */
      const discoverOwners = Effect.fn("RepositoryState.discoverOwners")(
        function* (repoRoot: string) {
          const inspect = (relative: string) =>
            Effect.gen(function* () {
              const entry = yield* lstatOption(
                path.join(repoRoot, relative),
              ).pipe(
                Effect.mapError((cause) =>
                  ownershipFailure(relative, "could not stat entry", cause),
                ),
              );
              if (Option.isSome(entry) && entry.value.type === "SymbolicLink") {
                return yield* ownershipFailure(
                  relative,
                  "symbolic links are unsupported",
                );
              }
              return entry;
            });

          const visit = (
            relative: string,
          ): Effect.Effect<ReadonlyArray<PackageOwner>, PlanFailure> =>
            Effect.gen(function* () {
              const entry = yield* inspect(relative);
              if (Option.isNone(entry)) return [];
              if (entry.value.type !== "Directory")
                return yield* ownershipFailure(relative, "expected directory");
              const names = yield* fileSystem
                .readDirectory(path.join(repoRoot, relative))
                .pipe(
                  Effect.mapError((cause) =>
                    ownershipFailure(
                      relative,
                      "could not list directory",
                      cause,
                    ),
                  ),
                );
              const alias = names.find(
                (name) =>
                  name.toLowerCase() === "package.json" &&
                  name !== "package.json",
              );
              if (alias !== undefined)
                return yield* ownershipFailure(
                  `${relative}/${alias}`,
                  "package manifests must use the canonical package.json filename",
                );
              if (names.includes("package.json")) {
                const manifestPath = `${relative}/package.json`;
                const manifest = yield* inspect(manifestPath);
                if (Option.isNone(manifest) || manifest.value.type !== "File")
                  return yield* ownershipFailure(
                    manifestPath,
                    "expected regular file",
                  );
                const contents = yield* fileSystem
                  .readFileString(path.join(repoRoot, manifestPath))
                  .pipe(
                    Effect.mapError((cause) =>
                      ownershipFailure(
                        manifestPath,
                        "could not read manifest",
                        cause,
                      ),
                    ),
                  );
                return [yield* parsePackageOwner(manifestPath, contents)];
              }
              const candidates = names
                .filter(
                  (name) =>
                    !name.startsWith(".") &&
                    name.toLowerCase() !== "node_modules",
                )
                .sort();
              const children = yield* Effect.forEach(candidates, (name) =>
                Effect.gen(function* () {
                  const child = `${relative}/${name}`;
                  const childEntry = yield* inspect(child);
                  return Option.isSome(childEntry) &&
                    childEntry.value.type === "Directory"
                    ? yield* visit(child)
                    : [];
                }),
              );
              return children.flat();
            });

          const owners = (yield* Effect.forEach(["apps", "packages"], visit))
            .flat()
            .sort(pathOrd);
          yield* assertDistinctOwners(owners);
          return owners;
        },
      );

      const capture = Effect.fn("RepositoryState.capture")(function* ({
        repoRoot,
        paths,
      }: {
        readonly repoRoot: string;
        readonly paths: ReadonlyArray<string>;
      }) {
        const snapshot = yield* readSnapshot(repoRoot, paths);
        const baseline = {
          root: yield* canonicalRoot(repoRoot),
          paths: yield* fingerprint(snapshot),
          packageOwners: yield* discoverOwners(repoRoot),
        } satisfies typeof PlanBaseline.Type;
        return { baseline, snapshot } satisfies RepositoryCapture;
      });

      const verify = Effect.fn("RepositoryState.verify")(function* ({
        baseline,
        repoRoot,
        paths,
      }: {
        readonly baseline: typeof PlanBaseline.Type;
        readonly repoRoot: string;
        readonly paths?: ReadonlyArray<string>;
      }) {
        const currentRoot = yield* canonicalRoot(repoRoot).pipe(
          Effect.orElseSucceed(() => ""),
        );
        const selected =
          paths === undefined
            ? baseline.paths
            : baseline.paths.filter((entry) => paths.includes(entry.path));
        const changes = yield* Effect.forEach(selected, (entry) =>
          readSnapshot(repoRoot, [entry.path]).pipe(
            Effect.flatMap(fingerprint),
            Effect.map((actual) =>
              compare(
                { root: baseline.root, paths: [entry] },
                { root: baseline.root, paths: actual },
              ),
            ),
            Effect.orElseSucceed(() => [
              { path: entry.path, kind: "typeChanged" as const },
            ]),
          ),
        );
        const expectedOwners = baseline.packageOwners;
        const ownershipChanged =
          expectedOwners === undefined
            ? false
            : yield* discoverOwners(repoRoot).pipe(
                Effect.map((owners) => !sameOwners(expectedOwners, owners)),
                Effect.orElseSucceed(() => true),
              );
        return [
          ...(ownershipChanged
            ? [{ path: ".", kind: "modified" as const }]
            : []),
          ...(currentRoot === baseline.root
            ? []
            : [{ path: ".", kind: "rootChanged" as const }]),
          ...changes.flat(),
        ] satisfies ReadonlyArray<RepositoryChange>;
      });

      return { capture, verify, discoverOwners } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(RepositoryState)(RepositoryState.make);
}
