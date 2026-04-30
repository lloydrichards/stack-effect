import { BunServices } from "@effect/platform-bun";
import { CatalogService } from "@repo/catalog";
import { Apply as ApplyIntent } from "@repo/domain/Apply";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { RepoSnapshot } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Console, Effect, FileSystem, Layer } from "effect";
import {
  ApplyService,
  BlueprintService,
  ContributionResolver,
  PlanService,
  ScaffoldFormatter,
} from "./src";
import { PlanAssessor } from "./src/service/plan/PlanAssessor";
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
    } satisfies typeof RepoSnapshot.Type;
  }),
} as never);

// ---------------------------------------------------------------------------
// PlanService layer wired with the mock snapshot
// ---------------------------------------------------------------------------
const PlanServiceLayer = Layer.effect(PlanService)(PlanService.make).pipe(
  Layer.provide(ContributionResolver.layer),
  Layer.provide(EmptyRepoSnapshotLayer),
  Layer.provide(PlanAssessor.layer),
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
            kind: TargetKind.make("server"),
            name: "api",
          }),
          modules: [{ id: ModuleId.make("http-api-server") }],
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
            kind: TargetKind.make("server"),
            name: "api",
          }),
          modules: [{ id: ModuleId.make("http-api-server") }],
        },
        {
          identity: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "domain",
          }),
          modules: [{ id: ModuleId.make("domain-api") }],
        },
      ],
    },
  },
] satisfies ReadonlyArray<{
  readonly label: string;
  readonly selection: typeof Selection.Type;
}>;

// ---------------------------------------------------------------------------
// Workflow: Selection → Blueprint → Plan → Apply
// ---------------------------------------------------------------------------
const repoRoot = "./test";

const toSlug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const main = Effect.gen(function* () {
  const blueprintService = yield* BlueprintService;
  const planService = yield* PlanService;
  const applyService = yield* ApplyService;
  const formatter = yield* ScaffoldFormatter;
  const fileSystem = yield* FileSystem.FileSystem;

  for (const example of examples) {
    const exampleRepoRoot = `${repoRoot}/${toSlug(example.label)}`;

    yield* fileSystem.remove(exampleRepoRoot, {
      recursive: true,
      force: true,
    });

    yield* Console.log(`\n${"=".repeat(60)}`);
    yield* Console.log(`# ${example.label}`);
    yield* Console.log(`${"=".repeat(60)}`);

    // Step 1: Selection → Blueprint
    const blueprint = yield* blueprintService.resolve(example.selection);
    const formattedBlueprint = yield* formatter.formatBlueprint(blueprint);
    yield* Console.log(`\n${formattedBlueprint}`);

    // Step 2: Blueprint → Plan
    const plan = yield* planService.build({
      blueprint,
      repoRoot: exampleRepoRoot,
      config: new StackConfig({
        name: "example" as any,
        runtime: { _tag: "bun" },
      }),
    });
    const formattedPlan = yield* formatter.formatPlan(plan);
    yield* Console.log(`\n${formattedPlan}`);

    // Step 3: Plan → Apply
    const applyIntent = new ApplyIntent({
      plan,
      decisions: [],
    });
    const applyResult = yield* applyService.apply({
      apply: applyIntent,
      repoRoot: exampleRepoRoot,
    });

    yield* Console.log(`\nApply root: ${exampleRepoRoot}`);
    yield* Console.log(`Created: ${applyResult.created.length}`);
    yield* Console.log(`Modified: ${applyResult.modified.length}`);
    yield* Console.log(`Skipped: ${applyResult.skipped.length}`);
    yield* Console.log(`Failed: ${applyResult.failed.length}`);

    if (applyResult.created.length > 0) {
      yield* Console.log(
        `Created paths:\n- ${applyResult.created.join("\n- ")}`,
      );
    }

    if (applyResult.failed.length > 0) {
      yield* Console.log(
        `Failed paths:\n- ${applyResult.failed
          .map((entry) => `${entry.path}: ${entry.reason}`)
          .join("\n- ")}`,
      );
    }
  }
});

void Effect.runPromise(
  main.pipe(
    Effect.provide(ApplyService.layer),
    Effect.provide(BlueprintService.layer),
    Effect.provide(PlanServiceLayer),
    Effect.provide(ScaffoldFormatter.layer),
    Effect.provide(BunServices.layer),
    Effect.provide(CatalogService.layer),
  ),
).catch((error) => {
  console.error("Error in Scaffold Scratchpad:", error);
});
