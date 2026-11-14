import { supports, type CatalogModel } from "./selection";

/** Catalog relationships, independent of the targets a developer has selected. */
export const moduleRelationships = (model: CatalogModel) =>
  model.modules
    .flatMap((module) => [
      ...module.dependencies.flatMap((dependency) =>
        dependency._tag === "required-module"
          ? [
              {
                from: module.id,
                to: dependency.moduleId,
                reason: "Requires module",
              },
            ]
          : dependency._tag === "required-capability"
            ? model.modules
                .filter(
                  (provider) =>
                    provider.provides?.includes(dependency.capability) &&
                    supports(provider, dependency.target),
                )
                .map((provider) => ({
                  from: module.id,
                  to: provider.id,
                  reason: `Provider option: ${dependency.capability}`,
                }))
            : [],
      ),
      ...(module.implies ?? []).map((implied) => ({
        from: module.id,
        to: implied.moduleId,
        reason: "Implies module",
      })),
      ...(module.children ?? []).map((child) => ({
        from: module.id,
        to: child.moduleId,
        reason: `${child.requirement} child`,
      })),
    ])
    .filter(
      (link) =>
        link.from !== link.to &&
        model.modules.some((module) => module.id === link.to),
    );

export const relationshipIslands = (model: CatalogModel) => {
  const links = moduleRelationships(model);
  const labels = model.modules.reduce(
    (current) =>
      new Map(
        model.modules.map((module) => [
          module.id,
          [
            current.get(module.id) ?? module.id,
            ...links.flatMap((link) =>
              link.from === module.id
                ? [current.get(link.to) ?? link.to]
                : link.to === module.id
                  ? [current.get(link.from) ?? link.from]
                  : [],
            ),
          ].sort((left, right) => left.localeCompare(right))[0]!,
        ]),
      ),
    new Map(model.modules.map((module) => [module.id, module.id])),
  );
  const connected = new Set(links.flatMap((link) => [link.from, link.to]));
  return [...new Set(labels.values())]
    .map((label) =>
      model.modules.filter(
        (module) => labels.get(module.id) === label && connected.has(module.id),
      ),
    )
    .filter((modules) => modules.length > 0)
    .sort((a, b) => b.length - a.length)
    .concat([model.modules.filter((module) => !connected.has(module.id))])
    .filter((modules) => modules.length > 0);
};
