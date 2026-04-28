import type { RepoSnapshot } from "@repo/domain/Plan";
import { TargetIdentity } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Console, Effect, Layer } from "effect";
import {
  BlueprintService,
  ContributionResolver,
  PlanService,
  ScaffoldFormatter,
} from "./src";
import { RepoSnapshotService } from "./src/service/plan/RepoSnapshotService";

// ---------------------------------------------------------------------------
// Mock RepoSnapshotService — returns every requested path as "missing"
// to simulate scaffolding into a fresh, empty repository.
// ---------------------------------------------------------------------------
const EmptyRepoSnapshotLayer = Layer.succeed(RepoSnapshotService, {
  load: Effect.fn("MockRepoSnapshotService.load")(function* ({
    paths,
  }: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) {
    return {
      paths: paths.map((path) => ({ _tag: "missing", path })),
    } satisfies RepoSnapshot;
  }),
} as never);

// ---------------------------------------------------------------------------
// PlanService layer wired with the mock snapshot
// ---------------------------------------------------------------------------
const PlanServiceLayer = Layer.effect(PlanService)(PlanService.make).pipe(
  Layer.provide(ContributionResolver.layer),
  Layer.provide(EmptyRepoSnapshotLayer),
);

// ---------------------------------------------------------------------------
// Test selections
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Workflow: Selection → Blueprint → Plan → formatted output
// ---------------------------------------------------------------------------
const repoRoot = "/tmp/scaffold-scratchpad";

const main = Effect.gen(function* () {
  const blueprintService = yield* BlueprintService;
  const planService = yield* PlanService;
  const formatter = yield* ScaffoldFormatter;

  for (const example of examples) {
    yield* Console.log(`\n${"=".repeat(60)}`);
    yield* Console.log(`# ${example.label}`);
    yield* Console.log(`${"=".repeat(60)}`);

    // Step 1: Selection → Blueprint
    const blueprint = yield* blueprintService.resolve(example.selection);
    const formattedBlueprint = yield* formatter.formatBlueprint(blueprint);
    yield* Console.log(`\n${formattedBlueprint}`);

    // Step 2: Blueprint → Plan
    const plan = yield* planService.build({ blueprint, repoRoot });
    const formattedPlan = yield* formatter.formatPlan(plan);
    yield* Console.log(`\n${formattedPlan}`);
  }
});

void Effect.runPromise(
  main.pipe(
    Effect.provide(BlueprintService.layer),
    Effect.provide(PlanServiceLayer),
    Effect.provide(ScaffoldFormatter.layer),
  ),
).catch((error) => {
  console.error("Error in Scaffold Scratchpad:", error);
});
