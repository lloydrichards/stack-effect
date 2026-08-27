import { assert, layer } from "@effect/vitest";
import {
  ClassicArchitecture,
  DddArchitecture,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Effect } from "effect";
import { CatalogService } from "../../CatalogService";
import {
  configTypescriptViteContents,
  dddConfigTypescriptViteContents,
} from "../content/client";

const configTypescriptVite = ModuleId.make("config-typescript-vite");

layer(CatalogService.layer)("config modules", (it) => {
  it.effect(
    "uses a DDD Vite TypeScript config that permits shared .ts imports without expanding target support",
    () =>
      Effect.gen(function* () {
        const catalog = yield* CatalogService;
        const omitted = yield* catalog.resolveModule(configTypescriptVite);
        const classic = yield* catalog.resolveModule(
          configTypescriptVite,
          ClassicArchitecture,
        );
        const ddd = yield* catalog.resolveModule(
          configTypescriptVite,
          DddArchitecture,
        );

        if (
          omitted === undefined ||
          classic === undefined ||
          ddd === undefined
        ) {
          throw new Error("Expected config TypeScript Vite module to resolve");
        }
        assert.deepStrictEqual(classic, omitted);
        assert.deepStrictEqual(ddd.supportedOn, classic.supportedOn);
        assert.deepStrictEqual(ddd.dependencies, classic.dependencies);
        assert.deepStrictEqual(classic.contributions, [
          {
            _tag: "file",
            path: "packages/config-typescript/vite.json",
            contents: configTypescriptViteContents,
          },
          ...classic.contributions.slice(1),
        ]);
        assert.deepStrictEqual(ddd.contributions, [
          {
            _tag: "file",
            path: "packages/config-typescript/vite.json",
            contents: dddConfigTypescriptViteContents,
          },
          ...classic.contributions.slice(1),
        ]);
        assert.isTrue(
          dddConfigTypescriptViteContents.includes(
            '"allowImportingTsExtensions": true',
          ),
        );
        assert.isFalse(
          configTypescriptViteContents.includes(
            '"allowImportingTsExtensions": true',
          ),
        );
        assert.isTrue(
          yield* catalog.isSupportedOn(
            configTypescriptVite,
            new TargetIdentity({
              kind: TargetKind.make("client-react"),
              name: "web",
            }),
            DddArchitecture,
          ),
        );
        assert.isFalse(
          yield* catalog.isSupportedOn(
            configTypescriptVite,
            new TargetIdentity({
              kind: TargetKind.make("server"),
              name: "todo-api",
            }),
            ClassicArchitecture,
          ),
        );
        assert.isFalse(
          yield* catalog.isSupportedOn(
            configTypescriptVite,
            new TargetIdentity({
              kind: TargetKind.make("server"),
              name: "todo-api",
            }),
            DddArchitecture,
          ),
        );
      }),
  );
});
