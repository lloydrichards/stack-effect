import type { StalePlanChange } from "@repo/domain/Apply";
import { pathOrd } from "@repo/domain/Order";
import {
  type PackageOwner,
  type PlanBaseline,
  type PlanBaselinePath,
  PlanFailure,
  type RepoSnapshot,
  type RepoSnapshotPath,
  RepositoryPath,
  repositoryRootPath,
} from "@repo/domain/Plan";
import {
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

/** The fingerprinted baseline of a capture and the text contents it was taken from. */
export type RepositoryCapture = {
  readonly baseline: PlanBaseline;
  readonly snapshot: RepoSnapshot;
};

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
  expected: PlanBaseline,
  actual: PlanBaseline,
): ReadonlyArray<StalePlanChange> => {
  const actualByPath = new Map(
    actual.paths.map((entry) => [entry.path, entry] as const),
  );
  return [
    ...(expected.root === actual.root
      ? []
      : [{ path: repositoryRootPath, kind: "rootChanged" as const }]),
    ...(expected.packageOwners === undefined ||
    (actual.packageOwners !== undefined &&
      sameOwners(expected.packageOwners, actual.packageOwners))
      ? []
      : [{ path: repositoryRootPath, kind: "modified" as const }]),
    ...expected.paths.flatMap((entry): ReadonlyArray<StalePlanChange> => {
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

export class RepositoryState extends Context.Service<
  RepositoryState,
  {
    readonly capture: (input: {
      readonly repositoryRoot: string;
      readonly paths: ReadonlyArray<RepositoryPath>;
    }) => Effect.Effect<RepositoryCapture, PlanFailure>;
    readonly verify: (input: {
      readonly baseline: PlanBaseline;
      readonly repositoryRoot: string;
      readonly paths?: ReadonlyArray<RepositoryPath> | undefined;
    }) => Effect.Effect<ReadonlyArray<StalePlanChange>>;
    // Discovers roots through grouping directories; package contents are not owners.
    readonly discoverOwners: (
      repositoryRoot: string,
    ) => Effect.Effect<ReadonlyArray<PackageOwner>, PlanFailure>;
  }
>()("@repo/scaffold/RepositoryState") {
  static readonly layer = Layer.effect(
    RepositoryState,
    Effect.gen(function* () {
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
      const canonicalRoot = Effect.fnUntraced(function* (
        repositoryRoot: string,
      ) {
        const absoluteRoot = path.resolve(repositoryRoot);
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
        repositoryRoot: string,
        snapshotPath: RepositoryPath,
      ) {
        const absolutePath = path.join(repositoryRoot, snapshotPath);
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
          } satisfies RepoSnapshotPath;
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
          } satisfies RepoSnapshotPath;
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
        } satisfies RepoSnapshotPath;
      });

      const readSnapshot = Effect.fnUntraced(function* (
        repositoryRoot: string,
        paths: ReadonlyArray<RepositoryPath>,
      ) {
        const snapshotPaths = [...new Set(paths)].sort(Order.String);
        const entries = yield* Effect.forEach(snapshotPaths, (snapshotPath) =>
          readEntry(repositoryRoot, snapshotPath),
        );
        return { paths: entries } satisfies RepoSnapshot;
      });

      const fingerprint = Effect.fnUntraced(function* (snapshot: RepoSnapshot) {
        const paths: Array<PlanBaselinePath> = [];
        for (const entry of snapshot.paths) {
          if (entry._tag !== "file") {
            paths.push(entry);
            continue;
          }
          const sha256 = yield* crypto.digestHex(
            Digest.sha256,
            new TextEncoder().encode(entry.contents),
          );
          paths.push({ _tag: "file", path: entry.path, sha256 });
        }
        return paths;
      });

      const discoverOwners = Effect.fn("RepositoryState.discoverOwners")(
        function* (repositoryRoot: string) {
          const inspect = Effect.fnUntraced(function* (relative: string) {
            const entry = yield* lstatOption(
              path.join(repositoryRoot, relative),
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

          const visit: (
            relative: string,
          ) => Effect.Effect<ReadonlyArray<PackageOwner>, PlanFailure> =
            Effect.fnUntraced(function* (relative: string) {
              const entry = yield* inspect(relative);
              if (Option.isNone(entry)) return [];
              if (entry.value.type !== "Directory")
                return yield* ownershipFailure(relative, "expected directory");
              const names = yield* fileSystem
                .readDirectory(path.join(repositoryRoot, relative))
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
                  .readFileString(path.join(repositoryRoot, manifestPath))
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
              const owners: Array<PackageOwner> = [];
              for (const name of candidates) {
                const child = `${relative}/${name}`;
                const childEntry = yield* inspect(child);
                if (
                  Option.isSome(childEntry) &&
                  childEntry.value.type === "Directory"
                ) {
                  owners.push(...(yield* visit(child)));
                }
              }
              return owners;
            });

          const owners = (yield* Effect.forEach(["apps", "packages"], visit))
            .flat()
            .sort(pathOrd);
          yield* assertDistinctOwners(owners);
          return owners;
        },
      );

      const capture = Effect.fn("RepositoryState.capture")(function* ({
        repositoryRoot,
        paths,
      }: {
        readonly repositoryRoot: string;
        readonly paths: ReadonlyArray<RepositoryPath>;
      }) {
        const snapshot = yield* readSnapshot(repositoryRoot, paths);
        const baseline = {
          root: yield* canonicalRoot(repositoryRoot),
          paths: yield* fingerprint(snapshot),
          packageOwners: yield* discoverOwners(repositoryRoot),
        } satisfies PlanBaseline;
        return { baseline, snapshot } satisfies RepositoryCapture;
      });

      const verifyEntry = Effect.fnUntraced(function* (
        repositoryRoot: string,
        root: string,
        entry: PlanBaselinePath,
      ) {
        const snapshot = yield* readSnapshot(repositoryRoot, [entry.path]);
        const actual = yield* fingerprint(snapshot);
        return compare({ root, paths: [entry] }, { root, paths: actual });
      });

      const verify = Effect.fn("RepositoryState.verify")(function* ({
        baseline,
        repositoryRoot,
        paths,
      }: {
        readonly baseline: PlanBaseline;
        readonly repositoryRoot: string;
        readonly paths?: ReadonlyArray<RepositoryPath> | undefined;
      }) {
        const currentRoot = yield* canonicalRoot(repositoryRoot).pipe(
          Effect.orElseSucceed(() => ""),
        );
        const selected =
          paths === undefined
            ? baseline.paths
            : baseline.paths.filter((entry) => paths.includes(entry.path));
        const changes = yield* Effect.forEach(selected, (entry) =>
          verifyEntry(repositoryRoot, baseline.root, entry).pipe(
            Effect.orElseSucceed(() => [
              { path: entry.path, kind: "typeChanged" as const },
            ]),
          ),
        );

        const expectedOwners = baseline.packageOwners;
        const ownershipChanged =
          expectedOwners !== undefined &&
          (yield* discoverOwners(repositoryRoot).pipe(
            Effect.map((owners) => !sameOwners(expectedOwners, owners)),
            Effect.orElseSucceed(() => true),
          ));

        return [
          ...(ownershipChanged
            ? [{ path: repositoryRootPath, kind: "modified" as const }]
            : []),
          ...(currentRoot === baseline.root
            ? []
            : [{ path: repositoryRootPath, kind: "rootChanged" as const }]),
          ...changes.flat(),
        ] satisfies ReadonlyArray<StalePlanChange>;
      });

      return RepositoryState.of({ capture, verify, discoverOwners });
    }),
  );
}
