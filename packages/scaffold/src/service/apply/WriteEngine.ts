import { ApplyFailure } from "@repo/domain/Apply";
import { Context, Effect, FileSystem, Layer, Match, Path } from "effect";

export type ApplyWriteRequest = {
  readonly path: string;
  readonly contents: string;
  readonly writeMode: "create" | "modify" | "override";
};

type ApplyWriteOutcome = {
  readonly path: string;
  readonly status: "created" | "modified" | "unchanged";
};

export class WriteEngine extends Context.Service<WriteEngine>()("WriteEngine", {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const atomicWrite = ({
      path,
      contents,
    }: {
      path: string;
      contents: string;
    }) => {
      const tempPath = `${path}.apply-temp-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;

      return Effect.gen(function* () {
        yield* fileSystem
          .writeFileString(tempPath, contents, { flag: "wx" })
          .pipe(
            Effect.mapError(
              (error) =>
                new ApplyFailure({
                  reason: "executionFailure",
                  message: `Could not write temporary file ${tempPath} during apply: ${error.message}`,
                }),
            ),
          );

        yield* fileSystem.rename(tempPath, path).pipe(
          Effect.mapError(
            (error) =>
              new ApplyFailure({
                reason: "executionFailure",
                message: `Could not rename ${tempPath} to ${path} during apply: ${error.message}`,
              }),
          ),
        );
      }).pipe(
        Effect.ensuring(
          fileSystem.remove(tempPath, { force: true }).pipe(Effect.ignore),
        ),
      );
    };

    const inspect = Effect.fn("WriteEngine.inspect")(function* (path: string) {
      const pathStat = yield* fileSystem
        .stat(path)
        .pipe(
          Effect.catch((error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(null)
              : Effect.fail(error),
          ),
        );

      if (pathStat === null) {
        return {
          _tag: "missing" as const,
        };
      }

      if (pathStat.type === "Directory") {
        return {
          _tag: "directory" as const,
        };
      }

      const contents = yield* fileSystem.readFileString(path);

      return {
        _tag: "file" as const,
        contents,
      };
    });

    const write = Effect.fn("WriteEngine.write")(function* ({
      repoRoot,
      write,
    }: {
      repoRoot: string;
      write: ApplyWriteRequest;
    }) {
      const absolutePath = path.join(repoRoot, write.path);

      const existingPath = yield* inspect(absolutePath);

      Match.value(write.writeMode).pipe(
        Match.when("create", () => {
          if (existingPath._tag !== "missing") {
            throw new ApplyFailure({
              reason: "repoRootInvalid",
              message: `Expected ${write.path} to be missing for create apply mode.`,
            });
          }
        }),
        Match.whenOr("modify", "override", () => {
          if (existingPath._tag !== "file") {
            throw new ApplyFailure({
              reason: "repoRootInvalid",
              message: `Expected ${write.path} to be an existing file for ${write.writeMode} apply mode.`,
            });
          }
        }),
        Match.exhaustive,
      );

      if (
        existingPath._tag === "file" &&
        existingPath.contents === write.contents
      ) {
        return {
          path: write.path,
          status: "unchanged",
        } satisfies ApplyWriteOutcome;
      }

      yield* fileSystem.makeDirectory(path.dirname(absolutePath), {
        recursive: true,
      });

      yield* atomicWrite({
        path: absolutePath,
        contents: write.contents,
      });

      return {
        path: write.path,
        status: existingPath._tag === "missing" ? "created" : "modified",
      } satisfies ApplyWriteOutcome;
    });

    return { write } as const;
  }),
}) {
  static readonly layer = Layer.effect(WriteEngine)(WriteEngine.make);
}
