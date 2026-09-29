import { Console, Data, Effect, Exit } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  AUTHOR_CATALOG_ASSET_PATH,
  CATALOG_ASSET_PATH,
  CONFIG_SCHEMA_ASSET_PATH,
} from "./catalog-registry-assets";
import { checkRegistry } from "./registry-checks";

// Checks a deployed docs origin, for example after a production deploy:
// bun run --cwd apps/docs check:registry https://stack-effect.lloydrichards.dev

class RegistryCheckFailed extends Data.TaggedError("RegistryCheckFailed")<{
  readonly message: string;
}> {}

const [base = ""] = process.argv.slice(2);

const program = Effect.gen(function* () {
  if (!URL.canParse(base))
    return yield* new RegistryCheckFailed({
      message:
        "Usage: check:registry <origin>, for example https://stack-effect.lloydrichards.dev",
    });
  const results = yield* checkRegistry(new URL(base), [
    CATALOG_ASSET_PATH,
    AUTHOR_CATALOG_ASSET_PATH,
    CONFIG_SCHEMA_ASSET_PATH,
  ]);
  yield* Effect.forEach(results, (check) =>
    Console.log(
      `${check.ok ? "PASS" : "FAIL"}  ${check.path}  ${check.check}  (${check.detail})`,
    ),
  );
  const failed = results.filter((check) => !check.ok).length;
  if (failed > 0)
    return yield* new RegistryCheckFailed({
      message: `${failed} of ${results.length} registry checks failed for ${base}`,
    });
  yield* Console.log(
    `All ${results.length} registry checks passed for ${base}`,
  );
});

const exit = await Effect.runPromiseExit(
  program.pipe(
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(FetchHttpClient.layer),
  ),
);
if (Exit.isFailure(exit)) process.exitCode = 1;
