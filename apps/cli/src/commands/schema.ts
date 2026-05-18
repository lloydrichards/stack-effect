import { CatalogService } from "@repo/catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { Selection } from "@repo/domain/Selection";
import { Console, Effect, Match, Schema } from "effect";
import { Command } from "effect/unstable/cli";

const PlanInput = Schema.Struct({
  selection: Selection,
  config: Schema.optional(StackConfig),
});

/**
 * Serializes the catalog for external consumption (LLMs, CI, tooling).
 *
 * Outputs a JSON object with `targets`, `modules`, and `selection` keys.
 * - `targets`: available target kinds with metadata and dependency info
 * - `modules`: available modules with supported targets, dependencies, implications
 * - `selection`: JSON Schema for the Selection input accepted by `plan`
 */
export const schema = Command.make("schema", {}, () =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;

    const targets = yield* Effect.forEach(catalog.getTargetKinds(), (kind) =>
      Effect.gen(function* () {
        const def = yield* catalog.getTarget(kind);
        return {
          kind: def.kind,
          title: def.title,
          description: def.description,
          visibility: def.visibility ?? "public",
          requiredModules: def.requiredModules ?? [],
        };
      }),
    );

    const modules = catalog.getModules().map((def) => ({
      id: def.id,
      title: def.title,
      description: def.description,
      visibility: def.visibility ?? "public",
      categories: def.categories ?? [],
      supportedOn: (def.supportedOn ?? []).map(
        Match.type<(typeof def.supportedOn)[number]>().pipe(
          Match.tag("kind", (s) => ({ _tag: "kind" as const, kind: s.kind })),
          Match.tag("identity", (s) => ({
            _tag: "identity" as const,
            kind: s.identity.kind,
            name: s.identity.name,
          })),
          Match.exhaustive,
        ),
      ),
      dependencies: (def.dependencies ?? []).map(
        Match.type<(typeof def.dependencies)[number]>().pipe(
          Match.tag("required-target", (d) => ({
            _tag: "required-target" as const,
            kind: d.identity.kind,
            name: d.identity.name,
          })),
          Match.tag("required-module", (d) => ({
            _tag: "required-module" as const,
            target: { kind: d.target.kind, name: d.target.name },
            moduleId: d.moduleId,
          })),
          Match.exhaustive,
        ),
      ),
      implies: (def.implies ?? []).map((imp) => ({
        targetKind: imp.targetKind,
        moduleId: imp.moduleId,
      })),
    }));
    const planInput = Schema.toStandardJSONSchemaV1(PlanInput)[
      "~standard"
    ].jsonSchema.input({ target: "draft-2020-12" });

    yield* Console.log(
      Schema.encodeSync(Schema.UnknownFromJsonString)({
        catalog: {
          targets,
          modules,
        },
        planInput,
      }),
    );
  }),
);
