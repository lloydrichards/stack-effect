import { CatalogFragment, CatalogValidationError } from "@repo/domain/Catalog";
import { Array as Arr, Effect, Schema } from "effect";

/** Validate fragments separately, then resolve references against their union. */
export const composeCatalog = Effect.fn("Catalog.compose")(function* (
  fragments: ReadonlyArray<unknown>,
  options: { readonly trustedFragmentIndex?: number } = {},
) {
  const decoded = yield* Effect.forEach(fragments, (fragment, index) =>
    Schema.decodeUnknownEffect(CatalogFragment)(fragment).pipe(
      Effect.mapError(
        (error) =>
          new CatalogValidationError({
            issues: [`Fragment ${index}: ${error.message}`],
          }),
      ),
    ),
  );
  const targets = Arr.flatMap(decoded, (fragment) => fragment.targets);
  const modules = Arr.flatMap(decoded, (fragment) => fragment.modules);
  const targetByKind = new Map<string, (typeof targets)[number]>(
    targets.map((target) => [target.kind, target]),
  );
  const moduleById = new Map<string, (typeof modules)[number]>(
    modules.map((module) => [module.id, module]),
  );
  const issues: Array<string> = [];

  const duplicates = (ids: ReadonlyArray<string>) =>
    ids.filter((id, index) => ids.indexOf(id) !== index);
  issues.push(
    ...duplicates(targets.map((target) => target.kind)).map(
      (kind) => `Duplicate target kind ${kind}`,
    ),
  );
  issues.push(
    ...duplicates(modules.map((module) => module.id)).map(
      (id) => `Duplicate module ID ${id}`,
    ),
  );

  const supports = (module: (typeof modules)[number], kind: string) =>
    module.supportedOn.some(
      (rule) => rule._tag === "kind" && rule.kind === kind,
    );
  const requireTarget = (kind: string, owner: string) => {
    if (!targetByKind.has(kind))
      issues.push(`${owner} references missing target ${kind}`);
  };
  const requireModule = (id: string, owner: string) => {
    if (!moduleById.has(id))
      issues.push(`${owner} references missing module ${id}`);
  };

  for (const target of targets) {
    for (const id of target.requiredModules ?? []) {
      requireModule(id, `Target ${target.kind}`);
      const required = moduleById.get(id);
      if (required && !supports(required, target.kind)) {
        issues.push(
          `Target ${target.kind} requires module ${id} on another target`,
        );
      }
    }
  }
  for (const module of modules) {
    for (const rule of module.supportedOn) {
      requireTarget(
        rule._tag === "kind" ? rule.kind : rule.identity.kind,
        `Module ${module.id}`,
      );
    }
    for (const dependency of module.dependencies) {
      const target =
        dependency._tag === "required-target"
          ? dependency.identity
          : dependency.target;
      requireTarget(target.kind, `Module ${module.id}`);
      if (dependency._tag === "required-module") {
        requireModule(dependency.moduleId, `Module ${module.id}`);
        const required = moduleById.get(dependency.moduleId);
        if (
          required &&
          !required.supportedOn.some((rule) => target.matches(rule))
        )
          issues.push(
            `Module ${module.id} requires ${dependency.moduleId} on an unsupported target`,
          );
      }
      if (
        dependency._tag === "required-capability" &&
        !modules.some(
          (candidate) =>
            candidate.provides?.includes(dependency.capability) &&
            candidate.supportedOn.some((rule) => target.matches(rule)),
        )
      )
        issues.push(
          `Module ${module.id} requires unavailable capability ${dependency.capability}`,
        );
    }
    for (const implication of module.implies ?? []) {
      requireTarget(implication.targetKind, `Module ${module.id}`);
      requireModule(implication.moduleId, `Module ${module.id}`);
      const implied = moduleById.get(implication.moduleId);
      if (implied && !supports(implied, implication.targetKind))
        issues.push(
          `Module ${module.id} implies ${implication.moduleId} on an unsupported target`,
        );
    }
    for (const child of module.children ?? []) {
      requireModule(child.moduleId, `Module ${module.id}`);
      const definition = moduleById.get(child.moduleId);
      if (
        definition &&
        !module.supportedOn.some((rule) =>
          definition.supportedOn.some((other) => {
            if (rule._tag === "kind" && other._tag === "kind")
              return rule.kind === other.kind;
            if (rule._tag === "identity" && other._tag === "identity")
              return rule.identity.toKey() === other.identity.toKey();
            return (
              (rule._tag === "kind" ? rule.kind : rule.identity.kind) ===
              (other._tag === "kind" ? other.kind : other.identity.kind)
            );
          }),
        )
      )
        issues.push(
          `Module ${module.id} has child ${child.moduleId} on another target`,
        );
    }
    for (const conflict of module.conflictsWith ?? []) {
      requireModule(conflict, `Module ${module.id}`);
      if (
        moduleById.has(conflict) &&
        !moduleById.get(conflict)?.conflictsWith?.includes(module.id)
      )
        issues.push(
          `Module ${module.id} has asymmetric conflict with ${conflict}`,
        );
    }
  }
  decoded.forEach((fragment, index) => {
    if (index === options.trustedFragmentIndex) return;
    for (const definition of [...fragment.targets, ...fragment.modules]) {
      if (definition.scripts?.length)
        issues.push(`Fragment ${index} contains Finalize scripts`);
    }
  });

  if (issues.length) return yield* new CatalogValidationError({ issues });
  return { targets, modules } as const;
});
