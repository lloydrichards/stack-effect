import {
  CatalogFragment,
  type CatalogIssue,
  type CatalogIssueCode,
  type CatalogIssueSubject,
  CatalogValidationError,
  catalogIssueLabel,
} from "@repo/domain/Catalog";
import { Array as Arr, Effect, Schema } from "effect";

/** A selected source that supplied one fragment, and the sources it may reference. */
export interface CatalogFragmentSource {
  readonly name: string;
  readonly requires: ReadonlyArray<string>;
}

export interface ComposeCatalogOptions {
  /** Allow Finalize scripts in this fragment only. */
  readonly trustedFragmentIndex?: number;
  /** Allow Finalize scripts in every fragment; consent happens when they run. */
  readonly allowFinalizeScripts?: boolean;
  /**
   * One entry per fragment. When present, a reference into another fragment
   * must name that fragment's source in `requires`.
   */
  readonly sources?: ReadonlyArray<CatalogFragmentSource>;
}

/** Validate fragments separately, then resolve references against their union. */
export const composeCatalog = Effect.fn("Catalog.compose")(function* (
  fragments: ReadonlyArray<unknown>,
  options: ComposeCatalogOptions = {},
) {
  const decoded = yield* Effect.forEach(fragments, (fragment, index) =>
    Schema.decodeUnknownEffect(CatalogFragment)(fragment).pipe(
      Effect.mapError(
        (error) =>
          new CatalogValidationError({
            details: [
              {
                subject: { _tag: "document" },
                code: "invalid-shape",
                message: `Fragment ${index}: ${error.message}`,
                fragment: index,
              },
            ],
          }),
      ),
    ),
  );
  const targets = Arr.flatMap(decoded, (fragment) => fragment.targets);
  const modules = Arr.flatMap(decoded, (fragment) => fragment.modules);
  const fragmentOf = (ids: ReadonlyArray<ReadonlyArray<string>>) =>
    new Map(
      ids
        .flatMap((fragmentIds, index) =>
          fragmentIds.map((id) => [id, index] as const),
        )
        .toReversed(),
    );
  const targetFragment = fragmentOf(
    decoded.map((fragment) => fragment.targets.map((target) => target.kind)),
  );
  const moduleFragment = fragmentOf(
    decoded.map((fragment) => fragment.modules.map((module) => module.id)),
  );
  // Index-aligned with `targets` and `modules`, so a duplicate ID keeps its own source.
  const targetFragments = decoded.flatMap((fragment, index) =>
    fragment.targets.map(() => index),
  );
  const moduleFragments = decoded.flatMap((fragment, index) =>
    fragment.modules.map(() => index),
  );
  const { sources } = options;
  const sourceLabel = (index: number | undefined) =>
    index === undefined ? "" : (sources?.[index]?.name ?? `fragment ${index}`);
  const targetByKind = new Map<string, (typeof targets)[number]>(
    targets.map((target) => [target.kind, target]),
  );
  const moduleById = new Map<string, (typeof modules)[number]>(
    modules.map((module) => [module.id, module]),
  );
  const issues: Array<CatalogIssue> = [];
  const moduleSubject = (id: string): CatalogIssueSubject => ({
    _tag: "module",
    id,
  });
  const targetSubject = (kind: string): CatalogIssueSubject => ({
    _tag: "target",
    kind,
  });
  const report = (
    subject: CatalogIssueSubject,
    code: CatalogIssueCode,
    message: string,
    fragment: number | undefined,
  ) => {
    issues.push({
      subject,
      code,
      message:
        sources === undefined || fragment === undefined
          ? message
          : `Source ${sourceLabel(fragment)}: ${message}`,
      ...(fragment === undefined ? {} : { fragment }),
    });
  };
  /** Whether a definition from `owner` may reference one from `referenced`. */
  const canReference = (
    owner: number | undefined,
    referenced: number | undefined,
  ) =>
    sources === undefined ||
    owner === undefined ||
    referenced === undefined ||
    owner === referenced ||
    (sources[owner]?.requires ?? []).includes(sourceLabel(referenced));
  const declareReference = (
    owner: CatalogIssueSubject,
    fragment: number | undefined,
    referenced: number | undefined,
    description: string,
  ) => {
    if (!canReference(fragment, referenced))
      report(
        owner,
        "undeclared-reference",
        `${catalogIssueLabel(owner)} references ${description} from source ${sourceLabel(referenced)} without declaring requires: ["${sourceLabel(referenced)}"]`,
        fragment,
      );
  };

  // Dependencies between sources are checked first: a missing source would
  // otherwise surface as a cascade of missing references.
  const sourceIssues = (sources ?? []).flatMap((source, index) =>
    source.requires.flatMap((name): ReadonlyArray<CatalogIssue> =>
      name === source.name
        ? [
            {
              subject: { _tag: "document" },
              code: "invalid-shape",
              message: `Source ${source.name} cannot require itself`,
              fragment: index,
            },
          ]
        : sources?.some((other) => other.name === name)
          ? []
          : [
              {
                subject: { _tag: "document" },
                code: "missing-source",
                message: `Source ${source.name} requires the ${name} catalog, which is not selected; select it with --catalog ${name}`,
                fragment: index,
              },
            ],
    ),
  );
  if (sourceIssues.length > 0)
    return yield* new CatalogValidationError({ details: sourceIssues });

  const duplicates = (ids: ReadonlyArray<ReadonlyArray<string>>) => {
    const flat = ids.flat();
    return Arr.dedupe(
      flat.filter((id, index) => flat.indexOf(id) !== index),
    ).map((id) => ({
      id,
      owners: ids.flatMap((fragmentIds, index) =>
        fragmentIds.includes(id) ? [sourceLabel(index)] : [],
      ),
    }));
  };
  const inSources = (owners: ReadonlyArray<string>) =>
    sources === undefined
      ? ""
      : ` in sources ${Arr.dedupe(owners).join(" and ")}`;
  issues.push(
    ...duplicates(
      decoded.map((fragment) => fragment.targets.map((target) => target.kind)),
    ).map(({ id, owners }): CatalogIssue => ({
      subject: targetSubject(id),
      code: "duplicate-id",
      message: `Duplicate target kind ${id}${inSources(owners)}`,
    })),
    ...duplicates(
      decoded.map((fragment) => fragment.modules.map((module) => module.id)),
    ).map(({ id, owners }): CatalogIssue => ({
      subject: moduleSubject(id),
      code: "duplicate-id",
      message: `Duplicate module ID ${id}${inSources(owners)}`,
    })),
  );

  issues.push(
    ...modules.flatMap((module, position): ReadonlyArray<CatalogIssue> =>
      module.targetPath === undefined ||
      (module.supportedOn.length > 0 &&
        module.supportedOn.every(
          (rule) =>
            rule._tag === "identity" && rule.identity.kind === "package",
        ))
        ? []
        : [
            {
              subject: moduleSubject(module.id),
              code: "unsupported-target",
              message: `Module ${module.id} placement requires only exact package identities`,
              ...(moduleFragments[position] === undefined
                ? {}
                : { fragment: moduleFragments[position] }),
            },
          ],
    ),
  );

  const supports = (module: (typeof modules)[number], kind: string) =>
    module.supportedOn.some(
      (rule) => rule._tag === "kind" && rule.kind === kind,
    );
  const requireTarget = (
    kind: string,
    owner: CatalogIssueSubject,
    fragment: number | undefined,
  ) => {
    if (!targetByKind.has(kind))
      report(
        owner,
        "missing-reference",
        `${catalogIssueLabel(owner)} references missing target ${kind}`,
        fragment,
      );
    declareReference(
      owner,
      fragment,
      targetFragment.get(kind),
      `target ${kind}`,
    );
  };
  const requireModule = (
    id: string,
    owner: CatalogIssueSubject,
    fragment: number | undefined,
  ) => {
    if (!moduleById.has(id))
      report(
        owner,
        "missing-reference",
        `${catalogIssueLabel(owner)} references missing module ${id}`,
        fragment,
      );
    declareReference(owner, fragment, moduleFragment.get(id), `module ${id}`);
  };

  for (const [position, target] of targets.entries()) {
    const fragment = targetFragments[position];
    for (const id of target.requiredModules ?? []) {
      requireModule(id, targetSubject(target.kind), fragment);
      const required = moduleById.get(id);
      if (required && !supports(required, target.kind)) {
        report(
          targetSubject(target.kind),
          "unsupported-target",
          `Target ${target.kind} requires module ${id} on another target`,
          fragment,
        );
      }
    }
  }
  for (const [position, module] of modules.entries()) {
    const fragment = moduleFragments[position];
    const owner = moduleSubject(module.id);
    for (const rule of module.supportedOn) {
      requireTarget(
        rule._tag === "kind" ? rule.kind : rule.identity.kind,
        owner,
        fragment,
      );
    }
    for (const dependency of module.dependencies) {
      const target =
        dependency._tag === "required-target"
          ? dependency.identity
          : dependency.target;
      requireTarget(target.kind, owner, fragment);
      if (dependency._tag === "required-module") {
        requireModule(dependency.moduleId, owner, fragment);
        const required = moduleById.get(dependency.moduleId);
        if (
          required &&
          !required.supportedOn.some((rule) => target.matches(rule))
        )
          report(
            owner,
            "unsupported-target",
            `Module ${module.id} requires ${dependency.moduleId} on an unsupported target`,
            fragment,
          );
      }
      if (
        dependency._tag === "required-capability" &&
        !modules.some(
          (candidate, candidatePosition) =>
            candidate.provides?.includes(dependency.capability) &&
            candidate.supportedOn.some((rule) => target.matches(rule)) &&
            canReference(fragment, moduleFragments[candidatePosition]),
        )
      )
        report(
          owner,
          "unavailable-capability",
          `Module ${module.id} requires unavailable capability ${dependency.capability}`,
          fragment,
        );
    }
    for (const implication of module.implies ?? []) {
      requireTarget(implication.targetKind, owner, fragment);
      requireModule(implication.moduleId, owner, fragment);
      const implied = moduleById.get(implication.moduleId);
      if (implied && !supports(implied, implication.targetKind))
        report(
          owner,
          "unsupported-target",
          `Module ${module.id} implies ${implication.moduleId} on an unsupported target`,
          fragment,
        );
    }
    for (const child of module.children ?? []) {
      requireModule(child.moduleId, owner, fragment);
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
        report(
          owner,
          "unsupported-target",
          `Module ${module.id} has child ${child.moduleId} on another target`,
          fragment,
        );
    }
    for (const conflict of module.conflictsWith ?? []) {
      const conflictFragment = moduleFragment.get(conflict);
      // Conflicts are symmetric, and another source cannot edit its side.
      if (
        sources !== undefined &&
        conflictFragment !== undefined &&
        conflictFragment !== fragment
      ) {
        report(
          owner,
          "cross-source-conflict",
          `Module ${module.id} conflicts with ${conflict} from source ${sourceLabel(conflictFragment)}; conflicts must stay within one source`,
          fragment,
        );
        continue;
      }
      requireModule(conflict, owner, fragment);
      if (
        moduleById.has(conflict) &&
        !moduleById.get(conflict)?.conflictsWith?.includes(module.id)
      )
        report(
          owner,
          "asymmetric-conflict",
          `Module ${module.id} has asymmetric conflict with ${conflict}`,
          fragment,
        );
    }
  }
  issues.push(
    ...decoded.flatMap((fragment, index): ReadonlyArray<CatalogIssue> =>
      options.allowFinalizeScripts || index === options.trustedFragmentIndex
        ? []
        : [
            ...fragment.targets
              .filter((target) => target.scripts?.length)
              .map((target) => ({
                subject: targetSubject(target.kind),
                code: "finalize-script" as const,
                message: `Fragment ${index} target ${target.kind} contains Finalize scripts`,
                fragment: index,
              })),
            ...fragment.modules
              .filter((module) => module.scripts?.length)
              .map((module) => ({
                subject: moduleSubject(module.id),
                code: "finalize-script" as const,
                message: `Fragment ${index} module ${module.id} contains Finalize scripts`,
                fragment: index,
              })),
          ],
    ),
  );

  if (issues.length)
    return yield* new CatalogValidationError({ details: issues });
  return {
    targets,
    modules,
    ...(sources === undefined
      ? {}
      : {
          origins: {
            targets: new Map(
              [...targetFragment].map(([kind, index]) => [
                kind,
                sourceLabel(index),
              ]),
            ),
            modules: new Map(
              [...moduleFragment].map(([id, index]) => [
                id,
                sourceLabel(index),
              ]),
            ),
          },
        }),
  } as const;
});
