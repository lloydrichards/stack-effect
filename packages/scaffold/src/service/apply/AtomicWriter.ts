import { ApplyFailure } from "@repo/domain/Apply";
import type { RepositoryPath } from "@repo/domain/Plan";
import {
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Random,
} from "effect";

export type ApplyWriteRequest = {
  readonly path: RepositoryPath;
  readonly contents: string;
  readonly writeMode: "create" | "modify" | "override";
};

export type ApplyWriteOutcome = {
  readonly path: RepositoryPath;
  readonly status: "created" | "modified" | "unchanged";
};

type InspectedPath =
  | { readonly _tag: "missing" }
  | { readonly _tag: "directory" }
  | { readonly _tag: "file"; readonly contents: string };

export class AtomicWriter extends Context.Service<
  AtomicWriter,
  {
    readonly write: (input: {
      readonly repositoryRoot: string;
      readonly write: ApplyWriteRequest;
      readonly onParentDirectoryReady?: Effect.Effect<void>;
    }) => Effect.Effect<ApplyWriteOutcome, ApplyFailure>;
  }
>()("@repo/scaffold/AtomicWriter") {
  static readonly layer = Layer.effect(
    AtomicWriter,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const atomicWrite = Effect.fnUntraced(function* ({
        path,
        contents,
      }: {
        path: string;
        contents: string;
      }) {
        const currentTime = yield* Clock.currentTimeMillis;
        const random = yield* Random.next;
        const tempPath = `${path}.apply-temp-${currentTime}-${random
          .toString(16)
          .slice(2)}`;

        return yield* Effect.gen(function* () {
          yield* fileSystem
            .writeFileString(tempPath, contents, { flag: "wx" })
            .pipe(
              Effect.mapError(
                (error) =>
                  new ApplyFailure({
                    message: `Could not write temporary file ${tempPath} during apply: ${error.message}`,
                    cause: error,
                  }),
              ),
            );

          yield* fileSystem.rename(tempPath, path).pipe(
            Effect.mapError(
              (error) =>
                new ApplyFailure({
                  message: `Could not rename ${tempPath} to ${path} during apply: ${error.message}`,
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

      const inspect = Effect.fnUntraced(function* (path: string) {
        const pathStat = yield* fileSystem.stat(path).pipe(
          Effect.asSome,
          Effect.catchReason(
            "PlatformError",
            "NotFound",
            () => Effect.succeedNone,
          ),
          Effect.mapError(
            (error) =>
              new ApplyFailure({
                message: `Could not inspect ${path} during apply: ${error.message}`,
                cause: error,
              }),
          ),
        );

        if (Option.isNone(pathStat)) {
          return { _tag: "missing" } satisfies InspectedPath;
        }

        if (pathStat.value.type === "Directory") {
          return { _tag: "directory" } satisfies InspectedPath;
        }

        const contents = yield* fileSystem.readFileString(path).pipe(
          Effect.mapError(
            (error) =>
              new ApplyFailure({
                message: `Could not read ${path} during apply: ${error.message}`,
                cause: error,
              }),
          ),
        );

        return { _tag: "file", contents } satisfies InspectedPath;
      });

      const validateWriteMode = Effect.fnUntraced(function* (
        write: ApplyWriteRequest,
        existingPath: InspectedPath,
      ) {
        if (write.writeMode === "create") {
          if (existingPath._tag !== "missing") {
            return yield* new ApplyFailure({
              message: `Expected ${write.path} to be missing for create apply mode.`,
            });
          }
          return;
        }

        if (existingPath._tag !== "file") {
          return yield* new ApplyFailure({
            message: `Expected ${write.path} to be an existing file for ${write.writeMode} apply mode.`,
          });
        }
      });

      const write = Effect.fn("AtomicWriter.write")(function* ({
        repositoryRoot,
        write,
        onParentDirectoryReady,
      }: {
        repositoryRoot: string;
        write: ApplyWriteRequest;
        onParentDirectoryReady?: Effect.Effect<void>;
      }) {
        const absolutePath = path.join(repositoryRoot, write.path);

        const existingPath: InspectedPath = yield* inspect(absolutePath);

        yield* validateWriteMode(write, existingPath);

        if (
          existingPath._tag === "file" &&
          existingPath.contents === write.contents
        ) {
          return {
            path: write.path,
            status: "unchanged",
          } satisfies ApplyWriteOutcome;
        }

        yield* fileSystem
          .makeDirectory(path.dirname(absolutePath), {
            recursive: true,
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new ApplyFailure({
                  message: `Could not create directory ${path.dirname(absolutePath)} during apply: ${error.message}`,
                  cause: error,
                }),
            ),
          );
        if (onParentDirectoryReady !== undefined) {
          yield* onParentDirectoryReady;
        }

        yield* atomicWrite({
          path: absolutePath,
          contents: write.contents,
        });

        return {
          path: write.path,
          status: existingPath._tag === "missing" ? "created" : "modified",
        } satisfies ApplyWriteOutcome;
      });

      return AtomicWriter.of({ write });
    }),
  );
}
