import { Effect, Option, Path } from "effect";

export const resolveNameAndRoot = Effect.fn("resolveNameAndRoot")(function* (
  nameInput: string,
  rootFlag: Option.Option<string>,
) {
  const path = yield* Path.Path;
  const base = Option.getOrElse(rootFlag, () => process.cwd());

  if (nameInput === ".") {
    const resolved = path.resolve(base);
    return { projectName: path.basename(resolved), repoRoot: resolved };
  }

  return {
    projectName: nameInput,
    repoRoot: path.resolve(base, nameInput),
  };
});
