import { assert, it } from "@effect/vitest";
import { CatalogDocument, TargetIdentity } from "@repo/domain/Catalog";
import { Effect, Schema } from "effect";
import { exportOfficialCatalog } from "../src/service";

it.effect(
  "should round-trip the published document with named and self references",
  () =>
    Effect.gen(function* () {
      const json = yield* exportOfficialCatalog;
      const codec = Schema.fromJsonString(CatalogDocument);
      const document = yield* Schema.decodeEffect(codec)(json);
      assert.strictEqual(
        yield* Schema.encodeEffect(codec)(document),
        json.trim(),
      );
      const references = document.modules.flatMap((module) => [
        ...module.dependencies.map((dependency) =>
          dependency._tag === "required-target"
            ? dependency.identity
            : dependency.target,
        ),
        ...module.supportedOn.flatMap((rule) =>
          rule._tag === "identity" ? [rule.identity] : [],
        ),
      ]);
      assert.include(references, "self");
      const identities = references.filter((reference) => reference !== "self");
      assert.isNotEmpty(identities);
      for (const identity of identities)
        assert.instanceOf(identity, TargetIdentity);
    }),
);
