import { layer } from "@effect/vitest";
import {
  GenerationDomainId,
  GenerationDomainOptionId,
  TargetKind,
} from "@repo/domain/Catalog";
import { Effect } from "effect";
import { describe, expect } from "vitest";
import { CatalogService } from "./CatalogService";

describe("generation domain registry", () => {
  layer(CatalogService.layer)("lookup", (it) => {
    it.effect(
      "looks up an option and exact target-kind adapter generically",
      () =>
        Effect.gen(function* () {
          const catalog = yield* CatalogService;
          const option = yield* catalog.getGenerationDomainOption(
            GenerationDomainId.make("infrastructure"),
            GenerationDomainOptionId.make("cloudflare"),
          );
          const adapter = yield* catalog.getGenerationDomainTargetAdapter(
            GenerationDomainId.make("infrastructure"),
            GenerationDomainOptionId.make("cloudflare"),
            TargetKind.make("client-react"),
          );
          expect(option).toMatchObject({
            minimumBindings: 1,
            maximumBindings: 1,
          });
          expect(adapter.adapterId).toBe("cloudflare-website-vite");
        }),
    );
  });
});
