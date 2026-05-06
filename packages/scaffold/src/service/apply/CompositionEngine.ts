import { CompositionOperation } from "@repo/domain/Plan";
import { Array, Context, Effect, Layer } from "effect";
import { JsonComposer } from "./JsonComposer";
import { TypeScriptComposer } from "./TypeScriptComposer";

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an operation targets JSON files.
 *
 * Note: We use a simple field check instead of Schema.toTaggedUnion guards
 * because the guards only match the last schema member for each tag value,
 * not all members with the same tag.
 */
const isJsonOp = (
  op: typeof CompositionOperation.Type,
): op is typeof CompositionOperation.cases.json.Type => op.fileType === "json";

const isTypeScriptOp = (
  op: typeof CompositionOperation.Type,
): op is typeof CompositionOperation.cases.typescript.Type =>
  op.fileType === "typescript";

// =============================================================================
// Service Definition
// =============================================================================

export class CompositionEngine extends Context.Service<CompositionEngine>()(
  "CompositionEngine",
  {
    make: Effect.gen(function* () {
      const jsonComposer = yield* JsonComposer;
      const typeScriptComposer = yield* TypeScriptComposer;

      return {
        compose: Effect.fn(function* (
          path: string,
          contents: string,
          operations: ReadonlyArray<typeof CompositionOperation.Type>,
        ) {
          if (operations.length === 0) {
            return contents;
          }

          let result = contents;

          // Filter and apply JSON operations if this is a JSON file
          const jsonOps = Array.filter(operations, isJsonOp);

          if (isJsonFile(path) && jsonOps.length > 0) {
            result = yield* jsonComposer.compose(result, jsonOps);
          }

          // Filter and apply TypeScript operations if this is a TypeScript file
          const tsOps = Array.filter(operations, isTypeScriptOp);

          if (isTypeScriptFile(path) && tsOps.length > 0) {
            result = yield* typeScriptComposer.compose(result, tsOps);
          }

          return result;
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(CompositionEngine)(
    CompositionEngine.make,
  ).pipe(
    Layer.provide(JsonComposer.layer),
    Layer.provide(TypeScriptComposer.layer),
  );
}

// =============================================================================
// Helpers
// =============================================================================

const isJsonFile = (path: string): boolean => path.endsWith(".json");

const isTypeScriptFile = (path: string): boolean =>
  path.endsWith(".ts") ||
  path.endsWith(".tsx") ||
  path.endsWith(".js") ||
  path.endsWith(".jsx");
