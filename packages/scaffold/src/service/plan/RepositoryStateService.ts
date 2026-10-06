import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import {
  PlanBaseline,
  type PlanBaselinePath,
  PlanFailure,
  type RepoSnapshot,
} from "@repo/domain/Plan";
import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { discoverPackageOwners } from "./PackageOwnership";
import { RepoSnapshotService } from "./RepoSnapshotService";

export type RepositoryChange = {
  readonly path: string;
  readonly kind:
    | "created"
    | "deleted"
    | "modified"
    | "typeChanged"
    | "rootChanged";
};

export class RepositoryStateService extends Context.Service<RepositoryStateService>()(
  "RepositoryStateService",
  {
    make: Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const snapshot = yield* RepoSnapshotService;

      const canonicalRoot = Effect.fn("RepositoryStateService.canonicalRoot")(
        function* (repoRoot: string) {
          const absoluteRoot = path.resolve(repoRoot);
          let current = absoluteRoot;
          const suffix: Array<string> = [];

          while (true) {
            const resolved = yield* fileSystem.realPath(current).pipe(
              Effect.catchTag("PlatformError", (error) =>
                error.reason._tag === "NotFound"
                  ? Effect.succeed(null)
                  : Effect.fail(error),
              ),
              Effect.mapError(
                () =>
                  new PlanFailure({
                    reason: "repoStateUnsupported",
                    message: "Could not resolve the repository root.",
                  }),
              ),
            );
            if (resolved !== null) {
              return path.join(resolved, ...suffix.reverse());
            }
            const parent = path.dirname(current);
            if (parent === current) {
              return absoluteRoot;
            }
            suffix.push(path.basename(current));
            current = parent;
          }
        },
      );

      const discoverOwners = (repoRoot: string) =>
        discoverPackageOwners(repoRoot).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        );
      const sameOwners = (
        expected: ReadonlyArray<{
          readonly path: string;
          readonly name: string;
        }>,
        actual: ReadonlyArray<{ readonly path: string; readonly name: string }>,
      ) =>
        expected.length === actual.length &&
        expected.every(
          (owner, index) =>
            owner.path === actual[index]?.path &&
            owner.name === actual[index]?.name,
        );

      const fromSnapshot = Effect.fn("RepositoryStateService.fromSnapshot")(
        function* ({
          repoRoot,
          repoSnapshot,
          includeOwnership = true,
        }: {
          readonly repoRoot: string;
          readonly repoSnapshot: typeof RepoSnapshot.Type;
          readonly includeOwnership?: boolean;
        }) {
          const root = yield* canonicalRoot(repoRoot);
          const paths = yield* Effect.forEach(repoSnapshot.paths, (entry) =>
            Effect.gen(function* () {
              if (entry._tag !== "file") {
                return entry satisfies typeof PlanBaselinePath.Type;
              }
              const digest = yield* crypto
                .digest("SHA-256", new TextEncoder().encode(entry.contents))
                .pipe(
                  Effect.mapError(
                    () =>
                      new PlanFailure({
                        reason: "repoStateUnsupported",
                        message: `Could not fingerprint ${entry.path} during planning.`,
                      }),
                  ),
                );
              return {
                _tag: "file" as const,
                path: entry.path,
                sha256: Array.from(digest, (byte) =>
                  byte.toString(16).padStart(2, "0"),
                ).join(""),
              };
            }),
          );
          const ownership = includeOwnership
            ? yield* discoverOwners(repoRoot)
            : undefined;
          return {
            root,
            paths,
            ...(ownership === undefined ? {} : { packageOwners: ownership }),
          } satisfies typeof PlanBaseline.Type;
        },
      );

      const capture = Effect.fn("RepositoryStateService.capture")(function* ({
        repoRoot,
        paths,
      }: {
        readonly repoRoot: string;
        readonly paths: ReadonlyArray<string>;
      }) {
        const repoSnapshot = yield* snapshot.load({ repoRoot, paths });
        return yield* fromSnapshot({ repoRoot, repoSnapshot });
      });

      const compare = (
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
            : [{ path: "packages", kind: "modified" as const }]),
          ...expected.paths.flatMap(
            (entry): ReadonlyArray<RepositoryChange> => {
              const current = actualByPath.get(entry.path);
              if (current === undefined)
                return [{ path: entry.path, kind: "deleted" }];
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
            },
          ),
        ];
      };

      const verify = Effect.fn("RepositoryStateService.verify")(function* ({
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
          snapshot.load({ repoRoot, paths: [entry.path] }).pipe(
            Effect.flatMap((repoSnapshot) =>
              fromSnapshot({ repoRoot, repoSnapshot, includeOwnership: false }),
            ),
            Effect.map((actual) =>
              compare({ root: baseline.root, paths: [entry] }, actual).filter(
                (change) => change.kind !== "rootChanged",
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
            ? [{ path: "packages", kind: "modified" as const }]
            : []),
          ...(currentRoot === baseline.root
            ? []
            : [{ path: ".", kind: "rootChanged" as const }]),
          ...changes.flat(),
        ] satisfies ReadonlyArray<RepositoryChange>;
      });

      return {
        capture,
        fromSnapshot,
        canonicalRoot,
        compare,
        verify,
        discoverOwners,
      } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(RepositoryStateService)(
    RepositoryStateService.make,
  ).pipe(
    Layer.provide(RepoSnapshotService.layer),
    Layer.provide(BrowserCrypto.layer),
  );
}
