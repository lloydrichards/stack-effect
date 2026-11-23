import { assert, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { RecipePreviewer } from "@repo/scaffold";
import { Effect, Layer, Schema } from "effect";

const preview = (kind: string, modules: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const service = yield* RecipePreviewer;
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
              name: kind === "workspace" ? "root" : "app",
            }),
            modules: modules.map((id) => ModuleId.make(id)),
          },
        ],
      },
    });
  }).pipe(
    Effect.provide(
      RecipePreviewer.layer.pipe(Layer.provide(OfficialCatalogLayer)),
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

it.effect(
  "the CAFE module generates a connected Foldkit Website and API Worker",
  () =>
    Effect.gen(function* () {
      const result = yield* preview("workspace", ["workspace-alchemy-cafe"]);
      const stack =
        result.files.find(({ path }) => path === "alchemy.run.ts")?.contents ??
        "";
      const paths = result.files.map(({ path }) => path);
      assert.includeMembers(paths, [
        "apps/client-foldkit-web/alchemy.ts",
        "apps/client-foldkit-web/src/features/rest.ts",
        "apps/cloudflare-worker-api/alchemy.ts",
        "apps/cloudflare-worker-api/src/Api.ts",
        "packages/domain/src/Api.ts",
        "packages/config-typescript/vite.json",
      ]);
      assert.include(stack, '"./apps/client-foldkit-web/alchemy"');
      assert.include(stack, '"./apps/cloudflare-worker-api/alchemy"');
      assert.include(
        stack,
        "Website({ VITE_SERVER_URL: api.url.as<string>() })",
      );
      assert.include(stack, "return { api: api.url, web: web.url }");
    }),
);
