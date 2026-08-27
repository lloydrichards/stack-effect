import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import {
  DddArchitecture,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, Layer } from "effect";
import { expect } from "vitest";
import { ConfigureService } from "./ConfigureService";

const serialize = (config: StackConfig) =>
  Effect.gen(function* () {
    const configure = yield* ConfigureService;
    return yield* configure.serializeConfig(config);
  }).pipe(
    Effect.provide(
      ConfigureService.layer.pipe(Layer.provideMerge(NodeServices.layer)),
    ),
  );

it.effect(
  "serializes omitted/Classic config as historical formatter-canonical bytes",
  () =>
    Effect.gen(function* () {
      const bytes = yield* serialize(
        new StackConfig({
          name: "classic",
          runtime: { _tag: "bun" },
          typescript: "7",
          lint: "biome",
          format: "biome",
          test: "vitest",
          monorepo: "turbo",
        }),
      );

      expect(bytes).toBe(`{
  "name": "classic",
  "runtime": { "_tag": "bun" },
  "typescript": "7",
  "lint": "biome",
  "format": "biome",
  "test": "vitest",
  "monorepo": "turbo"
}\n`);
    }),
);

it.effect("validates and emits sorted DDD records in canonical key order", () =>
  Effect.gen(function* () {
    const bytes = yield* serialize(
      new StackConfig({
        name: "ddd",
        runtime: { _tag: "node", packageManager: "pnpm" },
        targets: [
          {
            identity: new TargetIdentity({
              kind: TargetKind.make("server"),
              name: "zeta",
            }),
            architecture: DddArchitecture,
          },
          {
            identity: new TargetIdentity({
              kind: TargetKind.make("server"),
              name: "alpha",
            }),
            architecture: DddArchitecture,
          },
        ],
      }),
    );

    expect(bytes).toBe(`{
  "name": "ddd",
  "runtime": { "_tag": "node", "packageManager": "pnpm" },
  "targets": [
    {
      "identity": { "kind": "server", "name": "alpha" },
      "architecture": "ddd"
    },
    {
      "identity": { "kind": "server", "name": "zeta" },
      "architecture": "ddd"
    }
  ]
}\n`);
  }),
);
