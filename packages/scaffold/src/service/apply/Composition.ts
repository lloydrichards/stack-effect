import type { ApplyFailure } from "@repo/domain/Apply";
import type {
  CompositionOperation,
  JsonCompositionOperation,
  TypeScriptCompositionOperation,
} from "@repo/domain/Plan";
import { Array as Arr, Effect } from "effect";
import { composeJson } from "./JsonComposition";
import { composeTypeScript } from "./TypeScriptComposition";

/**
 * Applies planned composition operations to a file's contents, routing JSON
 * operations to JSON files and TypeScript operations to script files.
 */
export const compose: (
  path: string,
  contents: string,
  operations: ReadonlyArray<typeof CompositionOperation.Type>,
) => Effect.Effect<string, ApplyFailure> = Effect.fnUntraced(
  function* (path, contents, operations) {
    if (operations.length === 0) {
      return contents;
    }

    const jsonOps = Arr.filter(operations, isJsonOp);
    const jsonComposed =
      isJsonFile(path) && jsonOps.length > 0
        ? yield* composeJson(contents, jsonOps)
        : contents;

    const tsOps = Arr.filter(operations, isTypeScriptOp);
    return isTypeScriptFile(path) && tsOps.length > 0
      ? yield* composeTypeScript(jsonComposed, tsOps)
      : jsonComposed;
  },
);

const isJsonOp = (
  op: typeof CompositionOperation.Type,
): op is JsonCompositionOperation => op.fileType === "json";

const isTypeScriptOp = (
  op: typeof CompositionOperation.Type,
): op is TypeScriptCompositionOperation => op.fileType === "typescript";

const isJsonFile = (path: string) => path.endsWith(".json");

const isTypeScriptFile = (path: string) =>
  path.endsWith(".ts") ||
  path.endsWith(".tsx") ||
  path.endsWith(".js") ||
  path.endsWith(".jsx");
