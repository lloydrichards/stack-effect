import { assert, it } from "@effect/vitest";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { CatalogService } from "./CatalogService";

const owner = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "sdk/client",
});
const other = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "sdk/other",
});
const moduleId = ModuleId.make("sdk-client-code");
const catalog = CatalogService.fromFragments([
  {
    targets: [
      {
        kind: owner.kind,
        title: "Package",
        description: "Package",
        contributions: [],
      },
    ],
    modules: [
      {
        id: moduleId,
        title: "SDK client",
        description: "SDK client",
        supportedOn: [{ _tag: "identity", identity: owner }],
        dependencies: [],
        contributions: [],
      },
    ],
  },
]);

it.effect(
  "matches exact hierarchical owners without attaching modules or altering names",
  () =>
    Effect.gen(function* () {
      const service = yield* CatalogService;
      assert.isTrue(yield* service.isSupportedOn(moduleId, owner));
      assert.isFalse(yield* service.isSupportedOn(moduleId, other));
      assert.strictEqual(owner.toPath(), "packages/sdk/client");
      assert.strictEqual(owner.toPackageName(), "@repo/sdk-client");
    }).pipe(Effect.provide(catalog)),
);
