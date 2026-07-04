import { ApplyFailure } from "@repo/domain/Apply";
import { Context, Effect, FileSystem, Layer, Match, Path } from "effect";

export type ApplyWriteRequest = {
  readonly path: string;
  readonly contents: string;
  readonly writeMode: "create" | "modify" | "override";
};

export type ApplyWriteOutcome = {
  readonly path: string;
  readonly status: "created" | "modified" | "unchanged";
};

type InspectedPath =
  | { readonly _tag: "missing" }
  | { readonly _tag: "directory" }
  | { readonly _tag: "file"; readonly contents: string };

export interface WriteEngineShape {
  readonly write: (input: {
    readonly repoRoot: string;
    readonly write: ApplyWriteRequest;
  }) => Effect.Effect<ApplyWriteOutcome, ApplyFailure, never>;
}

export class WriteEngine extends Context.Service<
  WriteEngine,
  WriteEngineShape
>()("WriteEngine", {
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
      const pathStat = yield* fileSystem.stat(path).pipe(
        Effect.catch((error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(null)
            : Effect.fail(
                new ApplyFailure({
                  reason: "repoRootInvalid",
                  message: `Could not inspect ${path} during apply: ${error.message}`,
                }),
              ),
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

      const contents = yield* fileSystem.readFileString(path).pipe(
        Effect.mapError(
          (error) =>
            new ApplyFailure({
              reason: "repoRootInvalid",
              message: `Could not read ${path} during apply: ${error.message}`,
            }),
        ),
      );

      return {
        _tag: "file" as const,
        contents,
      } satisfies InspectedPath;
    });

    const validateWriteMode = Effect.fn("WriteEngine.validateWriteMode")(
      function* (write: ApplyWriteRequest, existingPath: InspectedPath) {
        return yield* Match.value(write.writeMode).pipe(
          Match.when("create", () =>
            existingPath._tag === "missing"
              ? Effect.void
              : Effect.fail(
                  new ApplyFailure({
                    reason: "repoRootInvalid",
                    message: `Expected ${write.path} to be missing for create apply mode.`,
                  }),
                ),
          ),
          Match.whenOr("modify", "override", () =>
            existingPath._tag === "file"
              ? Effect.void
              : Effect.fail(
                  new ApplyFailure({
                    reason: "repoRootInvalid",
                    message: `Expected ${write.path} to be an existing file for ${write.writeMode} apply mode.`,
                  }),
                ),
          ),
          Match.exhaustive,
        );
      },
    );

    const write = Effect.fn("WriteEngine.write")(function* ({
      repoRoot,
      write,
    }: {
      repoRoot: string;
      write: ApplyWriteRequest;
    }) {
      const absolutePath = path.join(repoRoot, write.path);

      const existingPath = yield* inspect(absolutePath);

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
                reason: "executionFailure",
                message: `Could not create directory ${path.dirname(absolutePath)} during apply: ${error.message}`,
              }),
          ),
        );

      yield* atomicWrite({
        path: absolutePath,
        contents: write.contents,
      });

      return {
        path: write.path,
        status: existingPath._tag === "missing" ? "created" : "modified",
      } satisfies ApplyWriteOutcome;
    });

    return { write } satisfies WriteEngineShape;
  }),
}) {
  static readonly layer = Layer.effect(WriteEngine)(WriteEngine.make);
}
