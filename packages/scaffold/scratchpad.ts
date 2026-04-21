import type { Selection } from "@repo/domain/Selection";
import { Effect } from "effect";
import { BlueprintService } from "./src";

const examples = [
  {
    label: "Selected server target with implied domain package",
    selection: {
      targets: [
        {
          identity: {
            kind: "server",
            name: "api",
          },
          modules: [{ id: "http-api-server" }],
          options: {},
        },
      ],
      modules: [],
      options: {},
    },
  },
  {
    label: "Explicit bootstrap with valid repo and target options",
    selection: {
      targets: [
        {
          identity: {
            kind: "server",
            name: "api",
          },
          modules: [{ id: "http-api-server" }],
          options: {
            httpApiStyle: "rest",
          },
        },
        {
          identity: {
            kind: "package",
            name: "domain",
          },
          modules: [{ id: "domain-api" }],
          options: {
            domainApiSurface: "api",
          },
        },
      ],
      modules: ["root-bootstrap"],
      options: {
        runtime: "bun",
        linter: "biome",
      },
    },
  },
] satisfies ReadonlyArray<{
  readonly label: string;
  readonly selection: typeof Selection.Type;
}>;

const main = Effect.gen(function* () {
  const blueprintService = yield* BlueprintService;

  for (const example of examples) {
    const blueprint = yield* blueprintService.resolve(example.selection);

    yield* Effect.log(`\n# ${example.label}\n${blueprint.prettyPrint()}`);
  }
});

void Effect.runPromise(main.pipe(Effect.provide(BlueprintService.layer))).catch(
  (error) => {
    console.error("Error in Blueprint Scratchpad:", error);
  },
);
