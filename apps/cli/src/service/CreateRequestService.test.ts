import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { ModuleId } from "@repo/domain/Catalog";
import { Array as Arr, Effect, Layer, Option } from "effect";
import {
  type CreateInput,
  CreateRequestService,
  type NormalizedCreateRequest,
} from "./CreateRequestService";

const TestLayer = CreateRequestService.layer.pipe(
  Layer.provide(CatalogService.layer),
  Layer.provide(NodeServices.layer),
);

const TestLayerWithNodeServices = Layer.mergeAll(TestLayer, NodeServices.layer);

const createInput = (input: CreateInput) => input;

const targetModules = (normalized: NormalizedCreateRequest) =>
  new Map(
    Arr.map(normalized.selection.targets, (target) => [
      String(target.identity.toKey()),
      Arr.map(target.modules, (module) => module.id),
    ]),
  );

describe("CreateRequestService", () => {
  it.effect(
    "normalizes compact create input, expands implied default targets, and renders a minimal command",
    () =>
      Effect.gen(function* () {
        const service = yield* CreateRequestService;
        const normalized = yield* service.normalizeInput(
          createInput({
            name: "chat-app",
            targets: ["client-react/web:client-react-chat"],
          }),
          Option.none(),
        );

        const modulesByTarget = targetModules(normalized);

        assert.strictEqual(
          normalized.command,
          "stack-effect create chat-app --target client-react/web:client-react-chat",
        );
        assert.isTrue(modulesByTarget.has("."));
        assert.deepStrictEqual(modulesByTarget.get("apps/client-react-web"), [
          ModuleId.make("client-react-chat"),
        ]);
        assert.deepStrictEqual(modulesByTarget.get("apps/server-api"), [
          ModuleId.make("server-chat-rpc"),
        ]);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "uses target default names when the compact target name is empty",
    () =>
      Effect.gen(function* () {
        const service = yield* CreateRequestService;
        const normalized = yield* service.normalizeInput(
          createInput({
            name: "api-app",
            targets: ["server/:server-chat-rpc"],
          }),
          Option.none(),
        );

        assert.isTrue(targetModules(normalized).has("apps/server-api"));
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("omits default config but includes explicit --no-git", () =>
    Effect.gen(function* () {
      const service = yield* CreateRequestService;
      const normalized = yield* service.normalizeInput(
        createInput({
          name: "no-git-app",
          targets: ["server/api:server-http-api"],
          git: false,
        }),
        Option.none(),
      );

      assert.strictEqual(
        normalized.command,
        "stack-effect create no-git-app --target server/api:server-http-api --no-git",
      );
      assert.notInclude(
        targetModules(normalized).get(".") ?? [],
        ModuleId.make("workspace-devenv-git"),
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("fails on conflicting runtime and package manager overrides", () =>
    Effect.gen(function* () {
      const service = yield* CreateRequestService;
      const error = yield* Effect.flip(
        service.normalizeInput(
          createInput({
            name: "bad-app",
            targets: ["server/api:server-http-api"],
            runtime: "node",
            packageManager: "bun",
          }),
          Option.none(),
        ),
      );

      assert.include(error, "conflicts");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects --from combined with direct create overrides", () =>
    Effect.gen(function* () {
      const service = yield* CreateRequestService;
      const error = yield* Effect.flip(
        service.readInput({
          name: Option.none(),
          from: Option.some("-"),
          targets: Option.none(),
          root: Option.none(),
          runtime: Option.some("node"),
          packageManager: Option.none(),
          monorepo: Option.none(),
          lint: Option.none(),
          format: Option.none(),
          test: Option.none(),
          noGit: true,
        }),
      );

      assert.include(error, "--runtime");
      assert.include(error, "--no-git");
    }).pipe(Effect.provide(TestLayerWithNodeServices)),
  );
});
