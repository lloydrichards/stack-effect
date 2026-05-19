import { CatalogService } from "@repo/catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { Selection } from "@repo/domain/Selection";
import { Console, Effect, Schema } from "effect";
import { Command } from "effect/unstable/cli";

const PlanInput = Schema.Struct({
  selection: Selection,
  config: Schema.optional(StackConfig),
});

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

    const planInput = Schema.toStandardJSONSchemaV1(PlanInput)[
      "~standard"
    ].jsonSchema.input({ target: "draft-2020-12" });

    yield* Console.log(
      Schema.encodeSync(Schema.UnknownFromJsonString)({
        catalog: catalog.toCatalogTree,
        planInput,
      }),
    );
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
