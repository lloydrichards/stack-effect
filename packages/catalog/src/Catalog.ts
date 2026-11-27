/**
 * Catalog composition and lookup: validate catalog fragments, resolve their
 * references against one another, and read the composed definitions through
 * `CatalogReader`.
 */
import type {
  CatalogFragment,
  CatalogGraph,
  CatalogNotFound,
  CatalogTree,
  CatalogValidationError,
  ModuleCapability,
  ModuleCategory,
  ModuleChild,
  ModuleDefinition,
  ModuleDependency,
  ModuleId,
  ModuleImplication,
  SupportedRuntime,
  TargetDefinition,
  TargetIdentity,
  TargetKind,
  Visibility,
} from "@repo/domain/Catalog";
import { Context, type Effect, Layer, type Option } from "effect";
import * as catalogReader from "./internal/catalogReader";
import * as internal from "./internal/compose";

/** A selected source that supplied one fragment, and the sources it may reference. */
export type FragmentSource = {
  readonly name: string;
  readonly requires: ReadonlyArray<string>;
};

export type ComposeOptions = {
  /** Allow Finalize scripts in this fragment only. */
  readonly trustedFragmentIndex?: number;
  /** Allow Finalize scripts in every fragment; consent happens when they run. */
  readonly allowFinalizeScripts?: boolean;
  /**
   * One entry per fragment. When present, a reference into another fragment
   * must name that fragment's source in `requires`.
   */
  readonly sources?: ReadonlyArray<FragmentSource>;
};

/** Source name per definition, present when fragments came from named sources. */
export type CatalogOrigins = {
  readonly targets: ReadonlyMap<string, string>;
  readonly modules: ReadonlyMap<string, string>;
  /** Sources each source declares in `requires`. */
  readonly requires: ReadonlyMap<string, ReadonlyArray<string>>;
};

/** Every fragment's definitions, with their origins when sources are named. */
export type ComposedCatalog = CatalogFragment & {
  readonly origins: CatalogOrigins | undefined;
};

/** Validate fragments separately, then resolve references against their union. */
export const compose: (
  fragments: ReadonlyArray<unknown>,
  options?: ComposeOptions,
) => Effect.Effect<ComposedCatalog, CatalogValidationError> = internal.compose;

export type BuilderCatalogTarget = {
  readonly kind: TargetKind;
  readonly title: string;
  readonly description: string;
  readonly defaultName?: string | undefined;
  readonly supportedRuntimes?: ReadonlyArray<SupportedRuntime> | undefined;
  readonly requiredModules: ReadonlyArray<ModuleId>;
};

export type BuilderCatalogModule = {
  readonly supportedRuntimes?: ReadonlyArray<SupportedRuntime> | undefined;
  readonly id: ModuleId;
  readonly title: string;
  readonly description: string;
  readonly visibility: Visibility;
  readonly dependencies: ReadonlyArray<ModuleDependency>;
  readonly implies: ReadonlyArray<ModuleImplication>;
  readonly children: ReadonlyArray<ModuleChild>;
  readonly conflictsWith: ReadonlyArray<ModuleId>;
};

export type BuilderCatalogTargetModules = {
  readonly owner: TargetIdentity;
  readonly modules: ReadonlyArray<BuilderCatalogModule>;
};

/** The public targets and the modules each selected owner can add, for Recipe Builder. */
export type BuilderCatalog = {
  readonly targets: ReadonlyArray<BuilderCatalogTarget>;
  readonly targetModules: ReadonlyArray<BuilderCatalogTargetModules>;
};

/**
 * Looks up target and module definitions in one composed catalog and projects
 * them into the tree, graph, and Recipe Builder views.
 *
 * **When to use**
 *
 * Build it once per operation with `fromFragments`, or receive it from
 * `CatalogLoader`, and reuse it across every lifecycle stage.
 *
 * **Gotchas**
 *
 * `getCapabilityProviders` with `requestingModuleId` keeps only providers the
 * requesting module's source may reference, mirroring `compose`.
 */
export class CatalogReader extends Context.Service<
  CatalogReader,
  {
    readonly getTarget: (
      kind: TargetKind,
    ) => Effect.Effect<TargetDefinition, CatalogNotFound>;
    readonly getTargetKinds: (options?: {
      visibility?: Visibility;
    }) => ReadonlyArray<TargetKind>;
    readonly getModule: (
      moduleId: ModuleId,
    ) => Effect.Effect<ModuleDefinition, CatalogNotFound>;
    readonly getModules: (options?: {
      category?: ModuleCategory;
      visibility?: Visibility;
    }) => ReadonlyArray<ModuleDefinition>;
    readonly getSupportedModules: (
      kind: TargetKind,
      options?: { visibility?: Visibility },
    ) => Effect.Effect<ReadonlyArray<ModuleDefinition>, CatalogNotFound>;
    readonly getCapabilityProviders: (options: {
      capability: ModuleCapability;
      target: TargetIdentity;
      visibility?: Visibility;
      /** Keep only providers this module's source may reference. */
      requestingModuleId?: ModuleId;
    }) => ReadonlyArray<ModuleDefinition>;
    /** `targetKind:moduleId` keys implied by the given modules. */
    readonly getImplications: (
      moduleIds: ReadonlyArray<ModuleId>,
    ) => Effect.Effect<ReadonlySet<string>, CatalogNotFound>;
    /** The selected source that supplied a definition, when sources are named. */
    readonly getSource: (
      subject:
        | { readonly _tag: "target"; readonly kind: string }
        | { readonly _tag: "module"; readonly id: string },
    ) => Option.Option<string>;
    readonly isSupportedOn: (
      moduleId: ModuleId,
      target: TargetIdentity,
    ) => Effect.Effect<boolean, CatalogNotFound>;
    readonly isImpliedByAny: (
      moduleId: ModuleId,
      targetKind: TargetKind,
    ) => Effect.Effect<boolean>;
    readonly toBuilderCatalog: (
      owners: ReadonlyArray<TargetIdentity>,
    ) => Effect.Effect<BuilderCatalog, CatalogNotFound>;
    readonly toCatalogTree: typeof CatalogTree.Type;
    readonly toGraph: CatalogGraph;
  }
>()("@repo/catalog/CatalogReader") {
  static readonly fromFragments = (
    fragments: ReadonlyArray<unknown>,
    options?: ComposeOptions,
  ): Layer.Layer<CatalogReader, CatalogValidationError> =>
    Layer.effect(CatalogReader, catalogReader.makeCatalogReader).pipe(
      Layer.provide(
        Layer.effect(catalogReader.CatalogDefinitions)(
          compose(fragments, options),
        ),
      ),
    );
}
