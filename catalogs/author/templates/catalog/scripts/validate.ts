import { buildCatalog } from "@stack-effect/author";
import { Console, Effect } from "effect";
import { catalog, catalogId, root } from "../catalog/index.ts";
import { runMain, Services } from "./platform.ts";

// Runs every build check without writing output. Each issue names the
// definition source and template file that caused it.
const program = buildCatalog(catalog, { catalogId, root }).pipe(
  Effect.flatMap(({ document }) =>
    Console.log(
      `Catalog ${catalogId} is valid: ${document.targets.length} targets, ${document.modules.length} modules`,
    ),
  ),
);

runMain(
  program.pipe(
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(Services),
  ),
  { disableErrorReporting: true },
);
