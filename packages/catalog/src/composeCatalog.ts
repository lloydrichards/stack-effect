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
  const subjectFragment = (subject: CatalogIssueSubject) =>
    subject._tag === "module"
      ? moduleFragment.get(subject.id)
      : subject._tag === "target"
        ? targetFragment.get(subject.kind)
        : undefined;
  const report = (
    subject: CatalogIssueSubject,
    code: CatalogIssueCode,
    message: string,
  ) => {
    const fragment = subjectFragment(subject);
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
  const canReference = (owner: number | undefined, referenced: number) =>
    sources === undefined ||
    owner === undefined ||
    owner === referenced ||
    (sources[owner]?.requires ?? []).includes(sourceLabel(referenced));
  const declareReference = (
    owner: CatalogIssueSubject,
    referenced: number | undefined,
    description: string,
  ) => {
    if (
      referenced !== undefined &&
      !canReference(subjectFragment(owner), referenced)
    )
      report(
        owner,
        "undeclared-reference",
        `${catalogIssueLabel(owner)} references ${description} from source ${sourceLabel(referenced)} without declaring requires: ["${sourceLabel(referenced)}"]`,
      );
  };

  issues.push(
    ...(sources ?? []).flatMap((source, index) =>
      source.requires
        .filter((name) => !sources?.some((other) => other.name === name))
        .map((name): CatalogIssue => ({
          subject: { _tag: "document" },
          code: "missing-source",
          message: `Source ${source.name} requires the ${name} catalog, which is not selected`,
          fragment: index,
        })),
    ),
  );

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

  const supports = (module: (typeof modules)[number], kind: string) =>
    module.supportedOn.some(
      (rule) => rule._tag === "kind" && rule.kind === kind,
    );
  const requireTarget = (kind: string, owner: CatalogIssueSubject) => {
    if (!targetByKind.has(kind))
      report(
        owner,
        "missing-reference",
        `${catalogIssueLabel(owner)} references missing target ${kind}`,
      );
    declareReference(owner, targetFragment.get(kind), `target ${kind}`);
  };
  const requireModule = (id: string, owner: CatalogIssueSubject) => {
    if (!moduleById.has(id))
      report(
        owner,
        "missing-reference",
        `${catalogIssueLabel(owner)} references missing module ${id}`,
      );
    declareReference(owner, moduleFragment.get(id), `module ${id}`);
  };

  for (const target of targets) {
    for (const id of target.requiredModules ?? []) {
      requireModule(id, targetSubject(target.kind));
      const required = moduleById.get(id);
      if (required && !supports(required, target.kind)) {
        report(
          targetSubject(target.kind),
          "unsupported-target",
          `Target ${target.kind} requires module ${id} on another target`,
        );
      }
    }
  }
  for (const module of modules) {
    const owner = moduleSubject(module.id);
    for (const rule of module.supportedOn) {
      requireTarget(
        rule._tag === "kind" ? rule.kind : rule.identity.kind,
        owner,
      );
    }
    for (const dependency of module.dependencies) {
      const target =
        dependency._tag === "required-target"
          ? dependency.identity
          : dependency.target;
      requireTarget(target.kind, owner);
      if (dependency._tag === "required-module") {
        requireModule(dependency.moduleId, owner);
        const required = moduleById.get(dependency.moduleId);
        if (
          required &&
          !required.supportedOn.some((rule) => target.matches(rule))
        )
          report(
            owner,
            "unsupported-target",
            `Module ${module.id} requires ${dependency.moduleId} on an unsupported target`,
          );
      }
      if (
        dependency._tag === "required-capability" &&
        !modules.some(
          (candidate) =>
            candidate.provides?.includes(dependency.capability) &&
            candidate.supportedOn.some((rule) => target.matches(rule)) &&
            canReference(
              moduleFragment.get(module.id),
              moduleFragment.get(candidate.id) ?? -1,
            ),
        )
      )
        report(
          owner,
          "unavailable-capability",
          `Module ${module.id} requires unavailable capability ${dependency.capability}`,
        );
    }
    for (const implication of module.implies ?? []) {
      requireTarget(implication.targetKind, owner);
      requireModule(implication.moduleId, owner);
      const implied = moduleById.get(implication.moduleId);
      if (implied && !supports(implied, implication.targetKind))
        report(
          owner,
          "unsupported-target",
          `Module ${module.id} implies ${implication.moduleId} on an unsupported target`,
        );
    }
    for (const child of module.children ?? []) {
      requireModule(child.moduleId, owner);
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
        );
    }
    for (const conflict of module.conflictsWith ?? []) {
      requireModule(conflict, owner);
      if (
        moduleById.has(conflict) &&
        !moduleById.get(conflict)?.conflictsWith?.includes(module.id)
      )
        report(
          owner,
          "asymmetric-conflict",
          `Module ${module.id} has asymmetric conflict with ${conflict}`,
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
