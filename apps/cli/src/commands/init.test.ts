import { assert, describe, it } from "@effect/vitest";
import { RecipeTargetString } from "@repo/scaffold";
import { Effect, Option, Schema } from "effect";
import { resolveInfrastructureTargets } from "./init";

const baseReactTarget =
  Schema.decodeUnknownSync(RecipeTargetString)("client-react/web");

describe("resolveInfrastructureTargets", () => {
  it.effect(
    "collects one React target for an interactive Cloudflare init",
    () =>
      Effect.gen(function* () {
        let prompts = 0;
        const targets = yield* resolveInfrastructureTargets({
          infrastructure: "cloudflare",
          yes: false,
          targets: Option.none(),
          promptTarget: Effect.sync(() => {
            prompts += 1;
            return baseReactTarget;
          }),
        });

        assert.strictEqual(prompts, 1);
        assert.deepStrictEqual(targets, Option.some([baseReactTarget]));
      }),
  );

  it.effect(
    "preserves an explicitly supplied Cloudflare target without prompting",
    () =>
      Effect.gen(function* () {
        let prompts = 0;
        const supplied = Option.some([baseReactTarget]);
        const targets = yield* resolveInfrastructureTargets({
          infrastructure: "cloudflare",
          yes: false,
          targets: supplied,
          promptTarget: Effect.sync(() => {
            prompts += 1;
            return baseReactTarget;
          }),
        });

        assert.strictEqual(prompts, 0);
        assert.deepStrictEqual(targets, supplied);
      }),
  );

  it.effect("keeps --yes Cloudflare target enforcement non-interactive", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        resolveInfrastructureTargets({
          infrastructure: "cloudflare",
          yes: true,
          targets: Option.none(),
          promptTarget: Effect.succeed(baseReactTarget),
        }),
      );

      if (result._tag !== "Failure") {
        return assert.fail("expected missing --yes target to fail");
      }
      assert.match(String(result.cause), /requires an explicit React target/);
    }),
  );
});
