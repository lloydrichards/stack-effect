import { ApplyError } from "@repo/domain/Apply";
import type { RepositoryPath } from "@repo/domain/Plan";
import {
  Clock,
  Context,
  Data,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Random,
  Schema,
} from "effect";

/** @internal */
export const WriteMode = Schema.Literals(["create", "modify", "override"]);

/** @internal */
export type WriteMode = typeof WriteMode.Type;

/** @internal */
export type WriteRequest = Data.TaggedEnum<{
  create: { path: RepositoryPath; contents: string };
  replace: {
    path: RepositoryPath;
    contents: string;
    reason: Exclude<WriteMode, "create">;
  };
}>;

/** @internal */
export const WriteRequest = Data.taggedEnum<WriteRequest>();

/** @internal */
export type WriteAttempt = Data.TaggedEnum<{
  created: { path: RepositoryPath };
  modified: { path: RepositoryPath };
  unchanged: { path: RepositoryPath };
  failed: {
    path: RepositoryPath;
    reason: string;
    causes: Array<string>;
  };
}>;

/** @internal */
export const WriteAttempt = Data.taggedEnum<WriteAttempt>();

type InspectedPath = Data.TaggedEnum<{
  missing: {};
  directory: {};
  file: { contents: string };
}>;

const InspectedPath = Data.taggedEnum<InspectedPath>();

/**
 * Reads and atomically writes files under one repository root.
 *
 * @internal
 */
export type RepositoryFiles = {
  readonly read: (
    path: RepositoryPath,
  ) => Effect.Effect<Option.Option<string>, ApplyError>;
  // `onParentDirectoryReady` runs once the parent directory exists, before the file is written.
  readonly write: (
    request: WriteRequest,
    onParentDirectoryReady: Effect.Effect<void>,
  ) => Effect.Effect<WriteAttempt, ApplyError>;
};

const expectedAttempt = (
  request: WriteRequest,
  existing: InspectedPath,
): Effect.Effect<WriteAttempt, ApplyError> =>
  Match.valueTags(request, {
    create: ({ path }) =>
      existing._tag === "missing"
        ? Effect.succeed(WriteAttempt.created({ path }))
        : Effect.fail(
            new ApplyError({
              message: `Expected ${path} to be missing for create apply mode.`,
            }),
          ),
    replace: ({ path, contents, reason }) => {
      if (existing._tag !== "file") {
        return Effect.fail(
          new ApplyError({
            message: `Expected ${path} to be an existing file for ${reason} apply mode.`,
          }),
        );
      }
      return Effect.succeed(
        existing.contents === contents
          ? WriteAttempt.unchanged({ path })
          : WriteAttempt.modified({ path }),
      );
    },
  });

/** @internal */
export class AtomicWriter extends Context.Service<
  AtomicWriter,
  {
    readonly at: (repositoryRoot: string) => RepositoryFiles;
  }
>()("@repo/scaffold/AtomicWriter") {
  static readonly layer = Layer.effect(
    AtomicWriter,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const atomicWrite = Effect.fnUntraced(function* (
        absolutePath: string,
        contents: string,
      ) {
        const currentTime = yield* Clock.currentTimeMillis;
        const random = yield* Random.next;
        const tempPath = `${absolutePath}.apply-temp-${currentTime}-${random
          .toString(16)
          .slice(2)}`;

        return yield* Effect.gen(function* () {
          yield* fileSystem
            .writeFileString(tempPath, contents, { flag: "wx" })
            .pipe(
              Effect.mapError(
                (error) =>
                  new ApplyError({
                    message: `Could not write temporary file ${tempPath}`,
                    cause: error,
                  }),
              ),
            );

          yield* fileSystem.rename(tempPath, absolutePath).pipe(
            Effect.mapError(
              (error) =>
                new ApplyError({
                  message: `Could not rename ${tempPath} to ${absolutePath}`,
                  cause: error,
                }),
            ),
          );
        }).pipe(
          Effect.ensuring(
            fileSystem.remove(tempPath, { force: true }).pipe(Effect.ignore),
          ),
        );
      });

      const inspect = Effect.fnUntraced(function* (absolutePath: string) {
        const pathStat = yield* fileSystem.stat(absolutePath).pipe(
          Effect.asSome,
          Effect.catchReason(
            "PlatformError",
            "NotFound",
            () => Effect.succeedNone,
          ),
          Effect.mapError(
            (error) =>
              new ApplyError({
                message: `Could not inspect ${absolutePath}`,
                cause: error,
              }),
          ),
        );

        if (Option.isNone(pathStat)) {
          return InspectedPath.missing();
        }

        if (pathStat.value.type === "Directory") {
          return InspectedPath.directory();
        }

        const contents = yield* fileSystem.readFileString(absolutePath).pipe(
          Effect.mapError(
            (error) =>
              new ApplyError({
                message: `Could not read ${absolutePath}`,
                cause: error,
              }),
          ),
        );

        return InspectedPath.file({ contents });
      });

      const read = Effect.fnUntraced(function* (
        repositoryRoot: string,
        filePath: RepositoryPath,
      ) {
        const absolutePath = path.join(repositoryRoot, filePath);
        const existing = yield* inspect(absolutePath);

        return yield* Match.valueTags(existing, {
          missing: () => Effect.succeedNone,
          directory: () =>
            Effect.fail(
              new ApplyError({
                message: `Expected ${absolutePath} to be a file.`,
              }),
            ),
          file: ({ contents }) => Effect.succeedSome(contents),
        });
      });

      const write = Effect.fn("AtomicWriter.write")(function* (
        repositoryRoot: string,
        request: WriteRequest,
        onParentDirectoryReady: Effect.Effect<void>,
      ) {
        const absolutePath = path.join(repositoryRoot, request.path);

        const existing = yield* inspect(absolutePath);
        const attempt = yield* expectedAttempt(request, existing);
        if (attempt._tag === "unchanged") {
          return attempt;
        }

        yield* fileSystem
          .makeDirectory(path.dirname(absolutePath), {
            recursive: true,
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new ApplyError({
                  message: `Could not create directory ${path.dirname(absolutePath)}`,
                  cause: error,
                }),
            ),
          );
        yield* onParentDirectoryReady;

        yield* atomicWrite(absolutePath, request.contents);

        return attempt;
      });

      return AtomicWriter.of({
        at: (repositoryRoot) => ({
          read: (filePath) => read(repositoryRoot, filePath),
          write: (request, onParentDirectoryReady) =>
            write(repositoryRoot, request, onParentDirectoryReady),
        }),
      });
    }),
  );
}
