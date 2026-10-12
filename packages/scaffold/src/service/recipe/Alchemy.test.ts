import { assert, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { RecipePreviewService } from "@repo/scaffold";
import { Effect, Layer, Schema } from "effect";

const preview = (kind: string, modules: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const service = yield* RecipePreviewService;
    return yield* service.preview({
      config: new StackConfig({
        name: Schema.NonEmptyString.make("deployment"),
        runtime: { _tag: "bun" },
      }),
      recipe: {
        targets: [
          {
            target: new TargetIdentity({
              kind: TargetKind.make(kind),
              name: "app",
            }),
            modules: modules.map((id) => ModuleId.make(id)),
          },
        ],
      },
    });
  }).pipe(
    Effect.provide(
      RecipePreviewService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
    ),
  );

it.effect("ordinary applications do not acquire infrastructure", () =>
  Effect.gen(function* () {
    const result = yield* preview("client-foldkit", []);
    assert.isFalse(result.files.some((file) => file.path === "alchemy.run.ts"));
    assert.notInclude(
      result.files.find((file) => file.path === "package.json")?.contents ?? "",
      '"alchemy"',
    );
  }),
);

for (const kind of ["client-foldkit", "client-react"]) {
  it.effect(`${kind} deployment adds no backend or HTTP feature`, () =>
    Effect.gen(function* () {
      const result = yield* preview(kind, [`alchemy-${kind}-website`]);
      assert.isTrue(
        result.files.some(
          (file) => file.path === `apps/${kind}-app/alchemy.ts`,
        ),
      );
      assert.isFalse(
        result.files.some(
          (file) =>
            file.path.includes("cloudflare-worker") ||
            file.path.startsWith("apps/server-"),
        ),
      );
      const root =
        result.files.find((file) => file.path === "alchemy.run.ts")?.contents ??
        "";
      assert.include(root, "const Applications = Effect.all({})");
      assert.notInclude(root, "./apps/");
    }),
  );
}

it.effect(
  "Worker deployment scaffolds the shared API independently of a frontend",
  () =>
    Effect.gen(function* () {
      const result = yield* preview("cloudflare-worker", [
        "alchemy-worker-deployment",
      ]);
      assert.isFalse(
        result.files.some((file) => file.path.startsWith("apps/client-")),
      );
      assert.notInclude(
        result.files.find(
          (file) =>
            file.path.endsWith("/src/Api.ts") && file.path.startsWith("apps/"),
        )?.contents ?? "",
        "alchemy/",
      );
      assert.include(
        result.files.find(
          (file) => file.path === "apps/cloudflare-worker-app/alchemy.ts",
        )?.contents ?? "",
        "HttpRouter.toHttpEffect",
      );
    }),
);

it.effect(
  "the Worker HTTP client adds the shared contract without creating a backend or deployment",
  () =>
    Effect.gen(function* () {
      const result = yield* preview("client-foldkit", [
        "client-foldkit-http-api-worker",
      ]);
      assert.isFalse(
        result.files.some((file) =>
          file.path.startsWith("apps/cloudflare-worker-"),
        ),
      );
      assert.isTrue(
        result.files.some((file) => file.path === "packages/domain/src/Api.ts"),
      );
      assert.isFalse(
        result.files.some(
          (file) =>
            file.path.startsWith("apps/server-") ||
            file.path === "alchemy.run.ts",
        ),
      );
      assert.isTrue(
        result.files.some((file) =>
          file.path.endsWith("/src/features/rest.ts"),
        ),
      );
    }),
);
