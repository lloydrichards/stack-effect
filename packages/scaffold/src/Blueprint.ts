/**
 * Blueprint resolution: turns a Selection into the dependency closure of
 * targets and modules a catalog provides.
 */
import type { CatalogService } from "@repo/catalog";
import type {
  Blueprint,
  BlueprintFailure,
  CatalogNotFound,
} from "@repo/domain/Blueprint";
import type { Selection } from "@repo/domain/Selection";
import type { StackConfig } from "@repo/domain/StackConfig";
import { Context, type Effect, Layer } from "effect";
import * as internal from "./internal/blueprintResolver";

/**
 * Resolves a Selection into a sorted Blueprint.
 *
 * **When to use**
 *
 * Resolve user intent before planning. Identical selections and catalogs
 * produce identical Blueprints.
 *
 * **Gotchas**
 *
 * Pass `config` to also reject targets and modules that do not support the
 * configured runtime. Targets whose paths or package names overlap fail with
 * `BlueprintFailure`.
 */
export class BlueprintResolver extends Context.Service<
  BlueprintResolver,
  {
    readonly resolve: (
      selection: Selection,
      config?: StackConfig,
    ) => Effect.Effect<Blueprint, BlueprintFailure | CatalogNotFound>;
  }
>()("@repo/scaffold/BlueprintResolver") {
  static readonly layer: Layer.Layer<BlueprintResolver, never, CatalogService> =
    Layer.effect(BlueprintResolver, internal.make);
}
