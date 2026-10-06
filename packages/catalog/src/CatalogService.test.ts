import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import {
  CatalogMetadataConflict,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Cause, Effect, Exit, Option } from "effect";
import { CatalogService } from "./CatalogService";

const owner = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "sdk-client",
});
const other = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "other",
});

const catalog = (paths: ReadonlyArray<string>) =>
  CatalogService.fromFragments([
    {
      targets: [
        {
          kind: TargetKind.make("package"),
          title: "Package",
          description: "Package",
          contributions: [],
        },
      ],
      modules: paths.map((path, index) => ({
        id: ModuleId.make(`placement-${index}`),
        title: "Placement",
        description: "Placement",
        supportedOn: [{ _tag: "identity" as const, identity: owner }],
        targetPath: path,
        dependencies: [],
        contributions: [],
      })),
    },
  ]);

it.effect("resolves unattached owner claims, including equal claims", () =>
  Effect.gen(function* () {
    const service = yield* CatalogService;
    const path = yield* service.getTargetPath(owner);
    assert.deepEqual(path, Option.some("packages/sdk/client"));
    assert.deepEqual(yield* service.getTargetPath(other), Option.none());
  }).pipe(
    Effect.provide(catalog(["packages/sdk/client", "packages/sdk/client"])),
  ),
);

it.effect("returns no metadata when no module claims a path", () =>
  Effect.gen(function* () {
    const service = yield* CatalogService;
    assert.deepEqual(yield* service.getTargetPath(owner), Option.none());
  }).pipe(Effect.provide(catalog([]))),
);

it.effect("reports contradictory claims as catalog metadata error", () =>
  Effect.gen(function* () {
    const service = yield* CatalogService;
    const result = yield* Effect.exit(service.getTargetPath(owner));
    assert(Exit.isFailure(result));
    const error = Cause.squash(result.cause);
    assert(error instanceof CatalogMetadataConflict);
    assert.deepEqual(error.paths, [
      "packages/elsewhere",
      "packages/sdk/client",
    ]);
    assert.strictEqual(error.identity.toKey(), owner.toKey());
  }).pipe(
    Effect.provide(catalog(["packages/sdk/client", "packages/elsewhere"])),
  ),
);
