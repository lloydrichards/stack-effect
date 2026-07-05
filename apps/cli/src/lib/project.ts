import * as nodePath from "node:path";
import { Effect, Option } from "effect";

export const resolveNameAndRoot = Effect.fn("resolveNameAndRoot")(function* (
  nameInput: string,
  rootFlag: Option.Option<string>,
) {
  const base = Option.getOrElse(rootFlag, () => process.cwd());

  if (nameInput === ".") {
    const resolved = nodePath.resolve(base);
    return { projectName: nodePath.basename(resolved), repoRoot: resolved };
  }

  return {
    projectName: nameInput,
    repoRoot: nodePath.resolve(base, nameInput),
  };
});
