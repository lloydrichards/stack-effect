import { NodeRuntime } from "@effect/platform-node";
import { Console, Data, Effect, FileSystem, Path } from "effect";
import pkg from "../package.json";
import { stackEffectCommand } from "../src/command";
import {
  collectCliReference,
  validateCliReference,
} from "../src/docs/CliReference";
import { renderCliReferencePages } from "../src/docs/CliReferenceMarkdown";
import { StackEffectLayer } from "../src/runtime";

class CliReferenceValidationError extends Data.TaggedError(
  "CliReferenceValidationError",
)<{
  readonly errors: ReadonlyArray<string>;
}> {
  override get message(): string {
    return `Invalid CLI documentation:\n${this.errors.join("\n")}`;
  }
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifest = yield* collectCliReference(stackEffectCommand, pkg.version);
  const validationErrors = validateCliReference(manifest);
  const outputDirectory = path.resolve(
    import.meta.dir,
    "../../docs/app/content/reference/cli",
  );

  if (validationErrors.length > 0) {
    return yield* new CliReferenceValidationError({
      errors: validationErrors,
    });
  }

  yield* fs.makeDirectory(outputDirectory, { recursive: true });
  const pages = renderCliReferencePages(manifest);
  const expectedFiles = new Set(pages.map((page) => `${page.slug}.mdx`));
  const updatedPages = yield* Effect.forEach(pages, (page) =>
    Effect.gen(function* () {
      const outputPath = path.join(outputDirectory, `${page.slug}.mdx`);
      const exists = yield* fs.exists(outputPath);
      const current = exists ? yield* fs.readFileString(outputPath) : undefined;

      if (current === page.content) return false;

      yield* fs.writeFileString(outputPath, page.content);
      return true;
    }),
  );
  const existingFiles = yield* fs.readDirectory(outputDirectory);
  const staleFiles = existingFiles.filter(
    (file) => file.endsWith(".mdx") && !expectedFiles.has(file),
  );
  yield* Effect.forEach(
    staleFiles,
    (file) => fs.remove(path.join(outputDirectory, file)),
    { discard: true },
  );
  const updatedCount = updatedPages.filter(Boolean).length;
  yield* Console.log(
    `Generated ${pages.length} CLI reference pages (${updatedCount} updated, ${staleFiles.length} removed) in ${path.relative(process.cwd(), outputDirectory)}`,
  );
});

NodeRuntime.runMain(program.pipe(Effect.provide(StackEffectLayer)));
