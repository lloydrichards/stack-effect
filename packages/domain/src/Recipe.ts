import { Effect, Result, Schema, SchemaGetter } from "effect";
import { Blueprint } from "./Blueprint";
import {
  duplicates,
  ModuleCapability,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "./Catalog";
import { Selection } from "./Selection";
import { StackConfig } from "./StackConfig";

/**
 * A portable recipe target describes a desired target and the modules the user
 * selected for that target. Resolution, validation, defaults, and provider
 * choices are owned by the CLI/catalog layer.
 */
const RecipeTargetSpec = Schema.Struct({
  target: TargetIdentity,
  modules: Schema.Array(ModuleId),
});

export type RecipeTargetSpec = typeof RecipeTargetSpec.Type;

/**
 * A Recipe is dashboard/CLI intent: selected workspace, app, and package
 * targets with their requested modules.
 */
export const RecipeSpec = Schema.Struct({
  targets: Schema.Array(RecipeTargetSpec),
});

export type RecipeSpec = typeof RecipeSpec.Type;

/**
 * How recipe resolution picks a provider module for a required capability that
 * the recipe leaves unmet.
 *
 * **When to use**
 *
 * Pass it inside `RecipeResolveOptions`. Use `fail-on-ambiguous` when a user
 * must choose between alternatives, `first-provider` when any provider will
 * do, and `explicit` to record choices a user already made.
 *
 * **Gotchas**
 *
 * Every strategy adds the only candidate when there is one. `explicit` falls
 * back to `fail-on-ambiguous` for requirements it does not name, and rejects a
 * named module that is not one of the candidates.
 */
const RecipeProviderStrategy = Schema.TaggedUnion({
  "fail-on-ambiguous": {},
  "first-provider": {},
  explicit: {
    providers: Schema.Array(
      Schema.Struct({
        target: TargetIdentity,
        capability: ModuleCapability,
        moduleId: ModuleId,
      }),
    ),
  },
});

export type RecipeProviderStrategy = typeof RecipeProviderStrategy.Type;

/**
 * The configuration and provider strategy a recipe resolves against.
 *
 * **When to use**
 *
 * Pass it to `RecipeResolver.resolve` with the recipe.
 */
export const RecipeResolveOptions = Schema.Struct({
  config: StackConfig,
  providerStrategy: RecipeProviderStrategy,
});

export type RecipeResolveOptions = typeof RecipeResolveOptions.Type;

/**
 * The recipe or configuration cannot be resolved against the selected
 * catalogs, such as an unknown target kind or a missing workspace module.
 *
 * **When to use**
 *
 * Handle it where a recipe from user input is resolved; `issues` lists each
 * problem with its path in the recipe.
 */
export class InvalidRecipeSpec extends Schema.TaggedError<InvalidRecipeSpec>()(
  "InvalidRecipeSpec",
  {
    issues: Schema.Array(
      Schema.Struct({
        path: Schema.Array(Schema.Union([Schema.String, Schema.Finite])),
        message: Schema.String,
      }),
    ),
  },
) {
  override get message(): string {
    return `Invalid recipe: ${this.issues.map((issue) => issue.message).join("; ")}`;
  }
}

/**
 * A selected module requires a capability on a target, and no module in the
 * selected catalogs provides it there for the configured runtime.
 *
 * **When to use**
 *
 * Handle it where a recipe is resolved; `requestingModuleId`, `target`, and
 * `capability` identify the unmet requirement.
 */
export class MissingRecipeProvider extends Schema.TaggedError<MissingRecipeProvider>()(
  "MissingRecipeProvider",
  {
    requestingModuleId: ModuleId,
    target: TargetIdentity,
    capability: ModuleCapability,
  },
) {
  override get message(): string {
    return `Module "${this.requestingModuleId}" requires capability "${this.capability}" on ${this.target.toKey()}, but no module in the selected catalogs provides it there for this runtime. Select a provider module explicitly or add a catalog that provides one.`;
  }
}

/**
 * A module that can provide a required capability.
 */
const RecipeProviderCandidate = Schema.Struct({
  moduleId: ModuleId,
  title: Schema.String,
  description: Schema.String,
});

/**
 * A selected module requires a capability on a target, several modules can
 * provide it, and the provider strategy does not choose between them.
 *
 * **When to use**
 *
 * Handle it where a recipe is resolved; `providers` lists the candidates in
 * catalog order so a caller can ask the user to pick one.
 */
export class AmbiguousRecipeProvider extends Schema.TaggedError<AmbiguousRecipeProvider>()(
  "AmbiguousRecipeProvider",
  {
    requestingModuleId: ModuleId,
    target: TargetIdentity,
    capability: ModuleCapability,
    providers: Schema.Array(RecipeProviderCandidate),
  },
) {
  override get message(): string {
    return `Module "${this.requestingModuleId}" requires capability "${this.capability}" on ${this.target.toKey()}, and several modules provide it: ${this.providers.map((provider) => `${provider.moduleId} (${provider.title})`).join(", ")}. Select one of them on ${this.target.toKey()} explicitly.`;
  }
}

/**
 * An `explicit` provider strategy names a module for a requirement, and that
 * module is not one of the providers the requester can use there.
 *
 * **When to use**
 *
 * Handle it where a recipe is resolved; `moduleId` is the rejected choice and
 * `providers` lists the valid candidates in catalog order.
 */
export class InvalidRecipeProvider extends Schema.TaggedError<InvalidRecipeProvider>()(
  "InvalidRecipeProvider",
  {
    requestingModuleId: ModuleId,
    target: TargetIdentity,
    capability: ModuleCapability,
    moduleId: ModuleId,
    providers: Schema.Array(RecipeProviderCandidate),
  },
) {
  override get message(): string {
    return `Module "${this.requestingModuleId}" requires capability "${this.capability}" on ${this.target.toKey()}, and "${this.moduleId}" cannot provide it there for this runtime. Choose one of: ${this.providers.map((provider) => `${provider.moduleId} (${provider.title})`).join(", ")}.`;
  }
}

/** Failures `RecipeResolver.resolve` can return. */
export type RecipeResolveError =
  | InvalidRecipeSpec
  | MissingRecipeProvider
  | AmbiguousRecipeProvider
  | InvalidRecipeProvider;

// Recipe Builder previews: the recipe and configuration a visitor chose, and
// the files the scaffold would write for them in an empty repository.

/**
 * One file a preview would create or modify, with its full contents.
 *
 * **When to use**
 *
 * Read it to show or diff the files a dry run or preview produces.
 */
const ApplyPreviewFile = Schema.Struct({
  path: Schema.String,
  status: Schema.Literals(["created", "modified"]),
  contents: Schema.String,
});

export type ApplyPreviewFile = typeof ApplyPreviewFile.Type;

/**
 * The recipe and configuration a preview runs for.
 *
 * **When to use**
 *
 * Decode it at the boundary where a preview request arrives, such as the
 * Recipe Builder worker or its URL state.
 */
export const RecipePreviewInput = Schema.Struct({
  recipe: RecipeSpec,
  config: StackConfig,
});

export type RecipePreviewInput = typeof RecipePreviewInput.Type;

/**
 * What a preview resolved and the files it would write, sorted by path.
 *
 * **When to use**
 *
 * Present a preview result, or encode it across a worker boundary.
 *
 * **Gotchas**
 *
 * `files` lists only created and modified paths, plus the generated
 * `stack.effect.json`. It is not a complete repository snapshot.
 */
export const RecipePreview = Schema.Struct({
  command: Schema.String,
  selection: Selection,
  blueprint: Blueprint,
  files: Schema.Array(ApplyPreviewFile),
});

export type RecipePreview = typeof RecipePreview.Type;

// Target spec syntax: the `kind/name[:module,...]` form that CLI flags and
// Recipe Builder URLs use, and the merging rules for repeated targets.

const splitCommaSeparated = (values: ReadonlyArray<string>): Array<string> =>
  values.flatMap((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );

const targetParts = (value: string) => {
  const slash = value.indexOf("/");
  const colon = value.indexOf(":", slash + 1);
  return {
    kind: value.slice(0, slash).trim(),
    name: value.slice(slash + 1, colon < 0 ? undefined : colon).trim(),
    modules: colon < 0 ? [] : splitCommaSeparated([value.slice(colon + 1)]),
    hasModules: colon >= 0,
  };
};

/**
 * Decodes one `kind/name[:module-id,...]` string into a recipe target spec,
 * and encodes it back.
 *
 * **When to use**
 *
 * Decode `--target` flags and Recipe Builder URL parameters.
 *
 * **Gotchas**
 *
 * The name must be a valid target name and cannot contain `:`. A trailing
 * `:` with no module IDs is rejected.
 *
 * **Example**
 *
 * ```ts
 * Schema.decodeUnknownSync(RecipeTargetString)("server/api:server-http-api")
 * // { target: { kind: "server", name: "api" }, modules: ["server-http-api"] }
 * ```
 */
export const RecipeTargetString = Schema.String.check(
  Schema.makeFilter((value) => {
    const parts = targetParts(value);
    return (
      (value.includes("/") &&
        Result.isSuccess(
          Schema.decodeResult(TargetIdentity)({
            kind: parts.kind,
            name: parts.name,
          }),
        ) &&
        (!parts.hasModules || parts.modules.length > 0) &&
        !parts.name.includes(":")) ||
      "Expected kind/name[:module-id,...] with a valid target name"
    );
  }),
).pipe(
  Schema.decodeTo(RecipeTargetSpec, {
    decode: SchemaGetter.transform((value) => {
      const parts = targetParts(value);
      return {
        target: new TargetIdentity({
          kind: TargetKind.make(parts.kind),
          name: parts.name,
        }),
        modules: parts.modules,
      };
    }),
    encode: SchemaGetter.transform(
      (spec) =>
        `${spec.target.kind}/${spec.target.name}${spec.modules.length > 0 ? `:${spec.modules.join(",")}` : ""}`,
    ),
  }),
);

/**
 * Decodes one `kind/name[:module-id,...]` string into a recipe target spec,
 * and encodes it back.
 *
 * **When to use**
 *
 * Decode `--target` flags and Recipe Builder URL parameters.
 *
 * **Gotchas**
 *
 * The name must be a valid target name and cannot contain `:`. A trailing
 * `:` with no module IDs is rejected.
 *
 * **Example**
 *
 * ```ts
 * Schema.decodeUnknownSync(RecipeTargetString)("server/api:server-http-api")
 * // { target: { kind: "server", name: "api" }, modules: ["server-http-api"] }
 * ```
 */
export type RecipeTargetString = typeof RecipeTargetString.Type;

const encodeRecipeTargetSpec = Schema.encodeSync(RecipeTargetString);

/**
 * Encodes recipe target specs as `kind/name[:module-id,...]` strings.
 *
 * **When to use**
 *
 * Write targets into a shareable URL or command line.
 */
export const encodeRecipeTargetSpecs = (
  specs: ReadonlyArray<RecipeTargetSpec>,
): Array<string> => specs.map((spec) => encodeRecipeTargetSpec(spec));

const renderRecipeTargetSpec = (spec: RecipeTargetSpec): string =>
  `${spec.target.kind}/${spec.target.name}:${spec.modules.join(",")}`;

/**
 * One target and the modules requested for it, after parsing.
 *
 * **When to use**
 *
 * Collect targets before merging them with `mergeRecipeTargets`.
 */
export type ParsedRecipeTarget = {
  readonly target: TargetIdentity;
  readonly modules: ReadonlyArray<ModuleId>;
};

/**
 * Merges targets with the same key, keeping first-seen order and each
 * module's first occurrence.
 *
 * **When to use**
 *
 * Combine targets from several flags or sources into one recipe.
 *
 * **Gotchas**
 *
 * The last target for a key supplies its identity, so callers that want
 * another identity pass it on every target with that key.
 */
export const mergeRecipeTargets = (
  targets: ReadonlyArray<ParsedRecipeTarget>,
): Array<ParsedRecipeTarget> => {
  const merged = new Map<
    string,
    { target: TargetIdentity; readonly modules: Set<ModuleId> }
  >();

  for (const { target, modules } of targets) {
    const key = `${target.kind}:${target.toKey()}`;
    const existing = merged.get(key);
    if (existing === undefined) {
      merged.set(key, { target, modules: new Set(modules) });
      continue;
    }
    existing.target = target;
    for (const moduleId of modules) existing.modules.add(moduleId);
  }

  return [...merged.values()].map(({ target, modules }) => ({
    target,
    modules: [...modules],
  }));
};

const recipeTargetSpecToCollected = Effect.fnUntraced(function* (
  spec: RecipeTargetSpec,
) {
  const duplicateModules = duplicates(spec.modules);

  if (duplicateModules.length > 0) {
    return yield* Effect.fail(
      `Duplicate module IDs in target spec "${renderRecipeTargetSpec(spec)}": ${duplicateModules.join(", ")}`,
    );
  }

  return { target: spec.target, modules: spec.modules };
});

/**
 * Validates decoded target specs and merges repeated targets.
 *
 * **When to use**
 *
 * Turn decoded `--target` flags into the targets of a recipe.
 *
 * **Gotchas**
 *
 * Fails with a message when one spec repeats a module ID. Repeating a target
 * across specs is allowed and merges them.
 */
export const parseRecipeTargetSpecs: (
  specs: ReadonlyArray<RecipeTargetSpec>,
) => Effect.Effect<Array<ParsedRecipeTarget>, string> = Effect.fnUntraced(
  function* (specs: ReadonlyArray<RecipeTargetSpec>) {
    const targets = yield* Effect.forEach(specs, recipeTargetSpecToCollected);
    return mergeRecipeTargets(targets);
  },
);
