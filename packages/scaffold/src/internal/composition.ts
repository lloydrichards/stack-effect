import type { ApplyFailure } from "@repo/domain/Apply";
import type {
  CompositionOperation,
  JsonCompositionOperation,
  TypeScriptCompositionOperation,
} from "@repo/domain/Plan";
import { Effect } from "effect";
import { composeJson } from "./jsonComposition";
import { composeTypeScript } from "./typeScriptComposition";

const isJsonOp = (op: CompositionOperation): op is JsonCompositionOperation =>
  op.fileType === "json";

const isTypeScriptOp = (
  op: CompositionOperation,
): op is TypeScriptCompositionOperation => op.fileType === "typescript";

const isJsonFile = (path: string) => path.endsWith(".json");

const isTypeScriptFile = (path: string) =>
  path.endsWith(".ts") ||
  path.endsWith(".tsx") ||
  path.endsWith(".js") ||
  path.endsWith(".jsx");

/**
 * Applies planned composition operations to a file's contents, routing JSON
 * operations to JSON files and TypeScript operations to script files.
 *
 * @internal
 */
export const compose: (
  path: string,
  contents: string,
  operations: ReadonlyArray<CompositionOperation>,
) => Effect.Effect<string, ApplyFailure> = Effect.fnUntraced(
  function* (path, contents, operations) {
    if (operations.length === 0) {
      return contents;
    }

    const jsonOps = operations.filter(isJsonOp);
    const jsonComposed =
      isJsonFile(path) && jsonOps.length > 0
        ? yield* composeJson(contents, jsonOps)
        : contents;

    const tsOps = operations.filter(isTypeScriptOp);
    return isTypeScriptFile(path) && tsOps.length > 0
      ? yield* composeTypeScript(jsonComposed, tsOps)
      : jsonComposed;
  },
);
