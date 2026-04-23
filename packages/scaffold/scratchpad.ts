import { TargetIdentity } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Effect } from "effect";
import { BlueprintService } from "./src";

const examples = [
  {
    label: "Selected server target with implied domain package",
    selection: {
      targets: [
        {
          identity: new TargetIdentity({
            kind: "server",
            name: "api",
          }),
          modules: [{ id: "http-api-server" }],
          options: {},
        },
      ],
    },
  },
  {
    label: "Explicit server and domain selections",
    selection: {
      targets: [
        {
          identity: new TargetIdentity({
            kind: "server",
            name: "api",
          }),
          modules: [{ id: "http-api-server" }],
          options: {
            httpApiStyle: "rest",
          },
        },
        {
          identity: new TargetIdentity({
            kind: "package",
            name: "domain",
          }),
          modules: [{ id: "domain-api" }],
          options: {
            domainApiSurface: "api",
          },
        },
      ],
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
