import { StalePlanChange } from "@repo/domain/Apply";
import {
  type PackageOwner,
  type PlanBaseline,
  type PlanBaselinePath,
  PlanFailure,
  type RepoSnapshot,
  type RepoSnapshotPath,
  RepositoryPath,
  repositoryRootPath,
  byPath,
} from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Effect,
  Equivalence,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
} from "effect";
import * as Digest from "effect/crypto/Digest";
import {
  CaseInsensitive,
  assertDistinctOwners,
  parsePackageOwner,
} from "./packageOwnership";

/**
 * The fingerprinted baseline of a capture and the text contents it was taken from.
 *
 * @internal
 */
export type RepositoryCapture = {
  readonly baseline: PlanBaseline;
  readonly snapshot: RepoSnapshot;
};

const sameOwners = Arr.makeEquivalence(
  Equivalence.Struct({
    path: Equivalence.String,
    name: Equivalence.String,
  }),
);

/**
 * List how `actual` differs from `expected`, by path and change kind.
 *
 * @internal
 */
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
      : [
          StalePlanChange.make({
            path: repositoryRootPath,
            kind: "rootChanged",
          }),
        ]),
    ...(expected.packageOwners === undefined ||
    (actual.packageOwners !== undefined &&
      sameOwners(expected.packageOwners, actual.packageOwners))
      ? []
      : [StalePlanChange.make({ path: repositoryRootPath, kind: "modified" })]),
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

/**
 * Repository state operations bound to one repository root.
 *
 * @internal
 */
export type Repository = {
  readonly capture: (
    paths: ReadonlyArray<RepositoryPath>,
  ) => Effect.Effect<RepositoryCapture, PlanFailure>;
  // Checks every path in `baseline`; narrow `baseline.paths` to check fewer.
  readonly verify: (
    baseline: PlanBaseline,
  ) => Effect.Effect<ReadonlyArray<StalePlanChange>>;
  // Discovers roots through grouping directories; package contents are not owners.
  readonly discoverOwners: Effect.Effect<
    ReadonlyArray<PackageOwner>,
    PlanFailure
  >;
};

/** @internal */
export class RepositoryState extends Context.Service<
  RepositoryState,
  {
    readonly at: (repositoryRoot: string) => Repository;
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
      ): Effect.fn.Return<RepoSnapshotPath, PlanFailure> {
        const absolutePath = path.join(repositoryRoot, snapshotPath);
        const symbolicLink = new PlanFailure({
          message: `Symbolic link in repository path ${snapshotPath} is unsupported.`,
        });

        const entry = yield* lstatOption(absolutePath).pipe(
          Effect.mapError(
            (cause) =>
              new PlanFailure({
                message: `Could not inspect ${snapshotPath} during planning: ${cause.message}`,
                cause,
              }),
          ),
        );
        if (Option.isNone(entry)) {
          return { _tag: "missing", path: snapshotPath };
        }

        let info = entry.value;
        if (info.type === "SymbolicLink") {
          // A link may only alias the repository root itself, and it must resolve.
          if (snapshotPath !== ".") return yield* symbolicLink;
          const target = yield* statOption(absolutePath).pipe(
            Effect.mapError(
              (cause) =>
                new PlanFailure({
                  message: `Could not inspect ${snapshotPath} during planning: ${cause.message}`,
                  cause,
                }),
            ),
          );
          if (Option.isNone(target)) return yield* symbolicLink;
          info = target.value;
        }

        if (info.type === "Directory") {
          return { _tag: "directory", path: snapshotPath };
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

        return { _tag: "file", path: snapshotPath, contents };
      });

      const readSnapshot = Effect.fnUntraced(function* (
        repositoryRoot: string,
        paths: ReadonlyArray<RepositoryPath>,
      ) {
        const snapshotPaths = [...new Set(paths)].sort(Order.String);
        const entries = yield* Effect.forEach(snapshotPaths, (snapshotPath) =>
          readEntry(repositoryRoot, snapshotPath),
        );
        return { paths: entries };
      });

      const fingerprintEntry = (
        entry: RepoSnapshotPath,
      ): Effect.Effect<PlanBaselinePath> =>
        entry._tag === "file"
          ? crypto
              .digestHex(
                Digest.sha256,
                new TextEncoder().encode(entry.contents),
              )
              .pipe(
                Effect.map((sha256) => ({
                  _tag: "file",
                  path: entry.path,
                  sha256,
                })),
              )
          : Effect.succeed(entry);

      const fingerprint = (snapshot: RepoSnapshot) =>
        Effect.forEach(snapshot.paths, fingerprintEntry);

      const inspectOwnerEntry = Effect.fnUntraced(function* (
        repositoryRoot: string,
        relative: string,
      ) {
        const entry = yield* lstatOption(
          path.join(repositoryRoot, relative),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new PlanFailure({
                message: `Cannot inspect package ownership at ${relative}: could not stat entry`,
                cause,
              }),
          ),
        );
        if (Option.isSome(entry) && entry.value.type === "SymbolicLink") {
          return yield* new PlanFailure({
            message: `Cannot inspect package ownership at ${relative}: symbolic links are unsupported`,
          });
        }
        return entry;
      });

      const readOwnerManifest = Effect.fnUntraced(function* (
        repositoryRoot: string,
        manifestPath: string,
      ) {
        const manifest = yield* inspectOwnerEntry(repositoryRoot, manifestPath);
        if (Option.isNone(manifest) || manifest.value.type !== "File")
          return yield* new PlanFailure({
            message: `Cannot inspect package ownership at ${manifestPath}: expected regular file`,
          });
        const contents = yield* fileSystem
          .readFileString(path.join(repositoryRoot, manifestPath))
          .pipe(
            Effect.mapError(
              (cause) =>
                new PlanFailure({
                  message: `Cannot inspect package ownership at ${manifestPath}: could not read manifest`,
                  cause,
                }),
            ),
          );
        return yield* parsePackageOwner(manifestPath, contents);
      });

      const visitOwners = Effect.fnUntraced(function* (
        repositoryRoot: string,
        relative: string,
      ): Effect.fn.Return<ReadonlyArray<PackageOwner>, PlanFailure> {
        const entry = yield* inspectOwnerEntry(repositoryRoot, relative);
        if (Option.isNone(entry)) return [];
        if (entry.value.type !== "Directory")
          return yield* new PlanFailure({
            message: `Cannot inspect package ownership at ${relative}: expected directory`,
          });
        const names = yield* fileSystem
          .readDirectory(path.join(repositoryRoot, relative))
          .pipe(
            Effect.mapError(
              (cause) =>
                new PlanFailure({
                  message: `Cannot inspect package ownership at ${relative}: could not list directory`,
                  cause,
                }),
            ),
          );
        const alias = names.find(
          (name) =>
            CaseInsensitive(name, "package.json") && name !== "package.json",
        );
        if (alias !== undefined)
          return yield* new PlanFailure({
            message: `Cannot inspect package ownership at ${relative}/${alias}: package manifests must use the canonical package.json filename`,
          });
        if (names.includes("package.json")) {
          return [
            yield* readOwnerManifest(
              repositoryRoot,
              `${relative}/package.json`,
            ),
          ];
        }
        const candidates = names
          .filter(
            (name) =>
              !name.startsWith(".") && !CaseInsensitive(name, "node_modules"),
          )
          .sort(Order.String);
        const owners = yield* Effect.forEach(candidates, (name) =>
          visitChildOwners(repositoryRoot, `${relative}/${name}`),
        );
        return owners.flat();
      });

      const visitChildOwners = Effect.fnUntraced(function* (
        repositoryRoot: string,
        child: string,
      ) {
        const entry = yield* inspectOwnerEntry(repositoryRoot, child);
        if (Option.isSome(entry) && entry.value.type === "Directory") {
          return yield* visitOwners(repositoryRoot, child);
        }
        return [];
      });

      const discoverOwners = Effect.fn("RepositoryState.discoverOwners")(
        function* (repositoryRoot: string) {
          const owners = (yield* Effect.forEach(["apps", "packages"], (group) =>
            visitOwners(repositoryRoot, group),
          ))
            .flat()
            .sort(byPath);
          yield* assertDistinctOwners(owners);
          return owners;
        },
      );

      const capture = Effect.fn("RepositoryState.capture")(function* (
        repositoryRoot: string,
        paths: ReadonlyArray<RepositoryPath>,
      ) {
        const snapshot = yield* readSnapshot(repositoryRoot, paths);
        const baseline = {
          root: yield* canonicalRoot(repositoryRoot),
          paths: yield* fingerprint(snapshot),
          packageOwners: yield* discoverOwners(repositoryRoot),
        };
        return { baseline, snapshot };
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

      const verify = Effect.fn("RepositoryState.verify")(function* (
        repositoryRoot: string,
        baseline: PlanBaseline,
      ): Effect.fn.Return<ReadonlyArray<StalePlanChange>> {
        const currentRoot = yield* canonicalRoot(repositoryRoot).pipe(
          Effect.orElseSucceed(() => ""),
        );
        const changes = yield* Effect.forEach(baseline.paths, (entry) =>
          verifyEntry(repositoryRoot, baseline.root, entry).pipe(
            Effect.orElseSucceed(() => [
              StalePlanChange.make({ path: entry.path, kind: "typeChanged" }),
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
            ? [
                StalePlanChange.make({
                  path: repositoryRootPath,
                  kind: "modified",
                }),
              ]
            : []),
          ...(currentRoot === baseline.root
            ? []
            : [
                StalePlanChange.make({
                  path: repositoryRootPath,
                  kind: "rootChanged",
                }),
              ]),
          ...changes.flat(),
        ];
      });

      return RepositoryState.of({
        at: (repositoryRoot) => ({
          capture: (paths) => capture(repositoryRoot, paths),
          verify: (baseline) => verify(repositoryRoot, baseline),
          discoverOwners: discoverOwners(repositoryRoot),
        }),
      });
    }),
  );
}
