import { Console, Effect, FileSystem, Option, Path } from "effect";
import { Command, Flag } from "effect/cli";

const loadSkill = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entry = process.argv[1];
  if (entry === undefined) {
    return yield* Effect.fail("CLI entry path is unavailable.");
  }

  const entryPath = yield* fs.realPath(entry);
  return yield* fs.readFileString(
    path.join(path.dirname(entryPath), "skills", "stack-effect", "SKILL.md"),
  );
});

const read = Command.make("read", {}, () =>
  Effect.gen(function* () {
    const markdown = yield* loadSkill;
    yield* Effect.sync(() => process.stdout.write(markdown));
  }),
).pipe(Command.withDescription("Print the Stack Effect skill as Markdown."));

const write = Command.make(
  "write",
  {
    repository: Flag.Directory("path").pipe(
      Flag.optional,
      Flag.withDescription("Repository directory (defaults to cwd)"),
    ),
    force: Flag.Boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Replace an existing skill file"),
    ),
  },
  ({ repository, force }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(
        Option.getOrElse(repository, () => process.cwd()),
      );
      const agents = path.join(root, ".agents");
      const skills = path.join(agents, "skills");
      const directory = path.join(skills, "stack-effect");
      const destination = path.join(directory, "SKILL.md");

      for (const segment of [agents, skills, directory, destination]) {
        const link = yield* fs.readLink(segment).pipe(Effect.option);
        if (Option.isSome(link)) {
          return yield* Effect.fail(
            `Skill path contains a symlink: ${segment}`,
          );
        }
      }

      if (!force && (yield* fs.exists(destination))) {
        return yield* Effect.fail(
          `Skill already exists: ${destination}. Use --force to replace it.`,
        );
      }

      const markdown = yield* loadSkill;
      yield* fs.makeDirectory(directory, { recursive: true });
      yield* fs.writeFileString(destination, markdown, {
        flag: force ? "w" : "wx",
      });
      yield* Console.log(`Installed Stack Effect skill: ${destination}`);
    }),
).pipe(
  Command.withDescription(
    "Install the Stack Effect skill at .agents/skills/stack-effect/SKILL.md.",
  ),
);

export const skill = Command.make("skill").pipe(
  Command.withSubcommands([read, write]),
  Command.withDescription(
    "Read or install the Stack Effect skill for coding agents.",
  ),
);
