/**
 * Blueprint resolution: turns a Selection into the full dependency closure of
 * targets and modules it needs, checked against the catalog.
 */
import type { CatalogService } from "@repo/catalog";
import type {
  Blueprint,
  BlueprintFailure,
  CatalogNotFound,
} from "@repo/domain/Blueprint";
import type { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Context, type Effect, Layer } from "effect";
import * as internal from "./internal/blueprintService";

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
export class BlueprintService extends Context.Service<
  BlueprintService,
  {
    readonly resolve: (
      selection: Selection,
      config?: StackConfig,
    ) => Effect.Effect<Blueprint, BlueprintFailure | CatalogNotFound>;
  }
>()("@repo/scaffold/BlueprintService") {
  static readonly layer: Layer.Layer<BlueprintService, never, CatalogService> =
    Layer.effect(BlueprintService, internal.make);
}
