import { CatalogService } from "@repo/catalog";
import { PlanRequest } from "@repo/domain/Plan";
import { Console, Effect, Schema } from "effect";
import { Command } from "effect/unstable/cli";

/**
 * Serializes the catalog for external consumption (LLMs, CI, tooling).
 *
 * Outputs a JSON object with:
 * - `catalog`: tree-structured catalog (targets with nested modules)
 * - `planInput`: JSON Schema for the Selection input accepted by `plan`
 */
export const schema = Command.make("schema", {}, () =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;

    const planInput = Schema.toStandardJSONSchemaV1(PlanRequest)[
      "~standard"
    ].jsonSchema.input({ target: "draft-2020-12" });

    const serialized = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Unknown),
    )({
      catalog: catalog.toCatalogTree,
      planInput,
    });
    yield* Console.log(serialized);
  }),
).pipe(
  Command.withDescription(
    "Serialize the full catalog (targets with nested modules) and the JSON Schema for plan input. Useful for LLMs, CI, and external tooling.",
  ),
  Command.withShortDescription(
    "(for LLMs) Export catalog and input schema as JSON",
  ),
  Command.withExamples([
    {
      command: "stack-effect schema",
      description: "Output full catalog and plan input schema",
    },
    {
      command: "stack-effect schema | jq '.catalog.targets'",
      description: "Inspect available targets",
    },
  ]),
);
