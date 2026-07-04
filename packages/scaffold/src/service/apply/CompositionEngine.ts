import { ApplyFailure } from "@repo/domain/Apply";
import { CompositionOperation } from "@repo/domain/Plan";
import { Array, Context, Effect, Layer } from "effect";
import { JsonComposer } from "./JsonComposer";
import { TypeScriptComposer } from "./TypeScriptComposer";

// NOTE: Use fileType instead of Schema.toTaggedUnion guards; those only match the last member per tag value.
const isJsonOp = (
  op: typeof CompositionOperation.Type,
): op is typeof CompositionOperation.cases.json.Type => op.fileType === "json";

const isTypeScriptOp = (
  op: typeof CompositionOperation.Type,
): op is typeof CompositionOperation.cases.typescript.Type =>
  op.fileType === "typescript";

export interface CompositionEngineShape {
  readonly compose: (
    path: string,
    contents: string,
    operations: ReadonlyArray<typeof CompositionOperation.Type>,
  ) => Effect.Effect<string, ApplyFailure, never>;
}

export class CompositionEngine extends Context.Service<
  CompositionEngine,
  CompositionEngineShape
>()("CompositionEngine", {
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

        const jsonOps = Array.filter(operations, isJsonOp);
        const jsonComposed =
          isJsonFile(path) && jsonOps.length > 0
            ? yield* jsonComposer.compose(contents, jsonOps)
            : contents;

        const tsOps = Array.filter(operations, isTypeScriptOp);
        return isTypeScriptFile(path) && tsOps.length > 0
          ? yield* typeScriptComposer.compose(jsonComposed, tsOps)
          : jsonComposed;
      }),
    } satisfies CompositionEngineShape;
  }),
}) {
  static readonly layer = Layer.effect(CompositionEngine)(
    CompositionEngine.make,
  ).pipe(
    Layer.provide(JsonComposer.layer),
    Layer.provide(TypeScriptComposer.layer),
    Layer.satisfiesServicesType<never>(),
  );
}

const isJsonFile = (path: string) => path.endsWith(".json");

const isTypeScriptFile = (path: string) =>
  path.endsWith(".ts") ||
  path.endsWith(".tsx") ||
  path.endsWith(".js") ||
  path.endsWith(".jsx");
