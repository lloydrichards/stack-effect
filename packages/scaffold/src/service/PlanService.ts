import type {
  Blueprint,
  ResolvedRepoModule,
  ResolvedTarget,
} from "@repo/domain/Blueprint";
import {
  type MergeRequirement,
  mergePlanCauses,
  type Plan,
  type PlanCause,
  type PlanEntryClassification,
  PlanFailure,
  type PlanTreeNode,
  type PlanWarning,
  type RepoSnapshot,
  type RepoSnapshotPath,
  toPlanRepoModuleCauses,
  toPlanTargetCauses,
  toPlanTargetCompositionCauses,
  toPlanTargetModuleCauses,
} from "@repo/domain/Plan";
import { Context, Effect, Layer } from "effect";
import {
  domainApiContents,
  serverHealthContents,
  serverHelloContents,
} from "../registry/content/api";
import {
  packageDomainTsconfigContents,
  rootBootstrapFiles,
} from "../registry/content/root-bootstrap";
import {
  serverIndexContents,
  serverTsconfigContents,
} from "../registry/content/server";
import { RepoSnapshotService } from "./RepoSnapshotService";

export class PlanService extends Context.Service<PlanService>()("PlanService", {
  make: Effect.gen(function* () {
    const snapshot = yield* RepoSnapshotService;

    const build = Effect.fn("PlanService.build")(function* ({
      blueprint,
      repoRoot,
    }: {
      blueprint: typeof Blueprint.Type;
      repoRoot: string;
    }) {
      const changeset = compilePlanChangeset(blueprint);
      const inspectionPaths = collectPlanInspectionPaths(changeset);
      const repoSnapshot = yield* snapshot.load({
        paths: inspectionPaths,
        repoRoot,
      });

      return projectPlan({ blueprint, changeset, repoSnapshot });
    });

    return { build } as const;
  }),
}) {
  static readonly layer = Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(RepoSnapshotService.layer),
  );
}
const compilePlanChangeset = (
  blueprint: typeof Blueprint.Type,
): PlanChangeset => {
  const changesetPaths = new Map<string, MutablePlanChangesetPath>();
  const projectedPaths = collectProjectedPlanPaths(blueprint);
  const projectedContents = collectProjectedContents(blueprint);
  const projectedPackageJsonExports =
    collectProjectedPackageJsonExports(blueprint);
  const projectedPackageJsonDependencies =
    collectProjectedPackageJsonDependencies(blueprint);
  const projectedPackageJsonScripts =
    collectProjectedPackageJsonScripts(blueprint);
  const projectedBarrelExports = collectProjectedBarrelExports(blueprint);
  const projectedTsconfigs = collectProjectedTsconfigs(blueprint);

  for (const projectedPath of projectedPaths) {
    getOrCreatePlanChangesetPath(
      changesetPaths,
      projectedPath.path,
      projectedPath.causes,
    );
  }

  for (const [path, contents] of projectedContents) {
    const pathEntry =
      changesetPaths.get(path) ??
      getOrCreatePlanChangesetPath(changesetPaths, path, [
        { _tag: "selectedRepoModule", moduleId: "root-bootstrap" },
      ] as const);

    assertPlanChangesetFamily({ pathEntry, family: "authoritative" });

    if (
      pathEntry.authoritativeContents !== undefined &&
      pathEntry.authoritativeContents !== contents
    ) {
      throw new PlanFailure({
        reason: "invalidChangeset",
        message: `Conflicting authoritative contents for ${path}.`,
      });
    }

    pathEntry.authoritativeContents = contents;
  }

  for (const [path, projectedExports] of projectedPackageJsonExports) {
    const pathEntry = getOrCreatePlanChangesetPath(
      changesetPaths,
      path,
      projectedExports[0]?.causes ??
        ([{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }] as const),
    );

    assertPlanChangesetFamily({ pathEntry, family: "packageJson" });
    pathEntry.packageJsonExports.push(...projectedExports);
  }

  for (const [
    path,
    projectedDependencies,
  ] of projectedPackageJsonDependencies) {
    const pathEntry = getOrCreatePlanChangesetPath(
      changesetPaths,
      path,
      projectedDependencies[0]?.causes ??
        ([{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }] as const),
    );

    assertPlanChangesetFamily({ pathEntry, family: "packageJson" });
    pathEntry.packageJsonDependencies.push(...projectedDependencies);
  }

  for (const [path, projectedScripts] of projectedPackageJsonScripts) {
    const pathEntry = getOrCreatePlanChangesetPath(
      changesetPaths,
      path,
      projectedScripts[0]?.causes ??
        ([{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }] as const),
    );

    assertPlanChangesetFamily({ pathEntry, family: "packageJson" });
    pathEntry.packageJsonScripts.push(...projectedScripts);
  }

  for (const [path, projectedExports] of projectedBarrelExports) {
    const pathEntry = getOrCreatePlanChangesetPath(
      changesetPaths,
      path,
      projectedExports[0]?.causes ??
        ([{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }] as const),
    );

    assertPlanChangesetFamily({ pathEntry, family: "barrel" });
    pathEntry.barrelExports.push(...projectedExports);
  }

  for (const [path, projectedTsconfig] of projectedTsconfigs) {
    const pathEntry = getOrCreatePlanChangesetPath(
      changesetPaths,
      path,
      projectedTsconfig.causes,
    );

    assertPlanChangesetFamily({ pathEntry, family: "tsconfig" });

    if (
      pathEntry.tsconfig !== undefined &&
      pathEntry.tsconfig.contents !== projectedTsconfig.contents
    ) {
      throw new PlanFailure({
        reason: "invalidChangeset",
        message: `Conflicting tsconfig outputs for ${path}.`,
      });
    }

    pathEntry.tsconfig = projectedTsconfig;
  }

  return {
    paths: [...changesetPaths.values()]
      .sort((left, right) => sortPaths(left.path, right.path))
      .map((pathEntry) => ({
        path: pathEntry.path,
        causes: pathEntry.causes,
        authoritativeContents: pathEntry.authoritativeContents,
        packageJsonExports: [...pathEntry.packageJsonExports],
        packageJsonDependencies: [...pathEntry.packageJsonDependencies],
        packageJsonScripts: [...pathEntry.packageJsonScripts],
        barrelExports: [...pathEntry.barrelExports],
        tsconfig: pathEntry.tsconfig,
      })),
  };
};
export const collectPlanInspectionPaths = (changeset: PlanChangeset) => {
  const requestedPaths = new Set<string>();

  for (const changesetPath of changeset.paths) {
    requestedPaths.add(changesetPath.path);

    for (const directoryPath of collectDirectoryPaths([changesetPath.path])) {
      requestedPaths.add(directoryPath);
    }
  }

  return [...requestedPaths].sort(sortPaths);
};
export const assertPlanChangesetFamily = ({
  pathEntry,
  family,
}: {
  pathEntry: MutablePlanChangesetPath;
  family: PlanChangesetOperationFamily;
}) => {
  if (pathEntry.family === undefined || pathEntry.family === family) {
    pathEntry.family = family;
    return;
  }

  throw new PlanFailure({
    reason: "invalidChangeset",
    message: `Conflicting planned operations for ${pathEntry.path}.`,
  });
};
export const projectPlan = ({
  blueprint,
  changeset,
  repoSnapshot,
}: {
  blueprint: Blueprint;
  changeset: PlanChangeset;
  repoSnapshot: RepoSnapshot;
}) => {
  const snapshotPaths = new Map(
    repoSnapshot.paths.map(
      (snapshotPath) => [snapshotPath.path, snapshotPath] as const,
    ),
  );
  const directoryPaths = collectDirectoryPaths(
    changeset.paths.map((changesetPath) => changesetPath.path),
  );
  const fileCauseMap = new Map<
    string,
    readonly [PlanCause, ...Array<PlanCause>]
  >(
    changeset.paths.map((changesetPath) => [
      changesetPath.path,
      changesetPath.causes,
    ]),
  );
  const directoryCauseMap = new Map<
    string,
    readonly [PlanCause, ...Array<PlanCause>]
  >();

  for (const changesetPath of changeset.paths) {
    const parts = changesetPath.path.split("/");

    for (let index = 1; index < parts.length; index += 1) {
      const path = parts.slice(0, index).join("/");
      const current = directoryCauseMap.get(path);

      directoryCauseMap.set(
        path,
        current
          ? mergePlanCauses(current, changesetPath.causes)
          : changesetPath.causes,
      );
    }
  }

  const rootBootstrap = blueprint.modules.find(
    (repoModule) => repoModule.moduleId === "root-bootstrap",
  );
  const rootCauses =
    (rootBootstrap === undefined
      ? undefined
      : toPlanRepoModuleCauses({ repoModule: rootBootstrap })) ??
    changeset.paths[0]?.causes ??
    ([{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }] as const);

  const fileClassifications = new Map<string, PlanEntryClassification>();
  const mergeRequirements: Array<MergeRequirement> = [];
  const warnings: Array<PlanWarning> = [];

  const assertAncestorDirectories = (path: string) => {
    const pathParts = path.split("/");

    for (let index = 1; index < pathParts.length; index += 1) {
      const ancestorPath = pathParts.slice(0, index).join("/");
      const snapshotPath = snapshotPaths.get(ancestorPath);

      if (snapshotPath?._tag === "file") {
        throw new PlanFailure({
          reason: "repoRootNotEmpty",
          message: `Expected ${ancestorPath} to be a directory during planning.`,
        });
      }
    }
  };

  for (const changesetPath of changeset.paths) {
    assertAncestorDirectories(changesetPath.path);

    if (
      changesetPath.authoritativeContents === undefined &&
      (changesetPath.packageJsonExports.length > 0 ||
        changesetPath.packageJsonDependencies.length > 0 ||
        changesetPath.packageJsonScripts.length > 0)
    ) {
      const packageJsonMergePlan = planPackageJsonMerge({
        path: changesetPath.path,
        projectedExports: changesetPath.packageJsonExports,
        projectedDependencies: changesetPath.packageJsonDependencies,
        projectedScripts: changesetPath.packageJsonScripts,
        snapshotPath: snapshotPaths.get(changesetPath.path),
      });

      fileClassifications.set(
        changesetPath.path,
        packageJsonMergePlan.classification,
      );
      mergeRequirements.push(...packageJsonMergePlan.mergeRequirements);
      warnings.push(...packageJsonMergePlan.warnings);
      continue;
    }

    if (
      changesetPath.authoritativeContents === undefined &&
      changesetPath.barrelExports.length > 0
    ) {
      const barrelMergePlan = planBarrelMerge({
        path: changesetPath.path,
        projectedBarrelExports: changesetPath.barrelExports,
        snapshotPath: snapshotPaths.get(changesetPath.path),
      });

      fileClassifications.set(
        changesetPath.path,
        barrelMergePlan.classification,
      );
      mergeRequirements.push(...barrelMergePlan.mergeRequirements);
      warnings.push(...barrelMergePlan.warnings);
      continue;
    }

    if (
      changesetPath.authoritativeContents === undefined &&
      changesetPath.tsconfig !== undefined
    ) {
      const tsconfigMergePlan = planTsconfigMerge({
        path: changesetPath.path,
        projectedTsconfig: changesetPath.tsconfig,
        snapshotPath: snapshotPaths.get(changesetPath.path),
      });

      fileClassifications.set(
        changesetPath.path,
        tsconfigMergePlan.classification,
      );
      mergeRequirements.push(...tsconfigMergePlan.mergeRequirements);
      warnings.push(...tsconfigMergePlan.warnings);
      continue;
    }

    if (changesetPath.authoritativeContents === undefined) {
      throw new PlanFailure({
        reason: "invalidChangeset",
        message: `No planned operation defined for ${changesetPath.path}.`,
      });
    }

    const snapshotPath = snapshotPaths.get(changesetPath.path);

    if (snapshotPath === undefined || snapshotPath._tag === "missing") {
      fileClassifications.set(changesetPath.path, "create");
      continue;
    }

    if (snapshotPath._tag !== "file") {
      throw new PlanFailure({
        reason: "repoRootNotEmpty",
        message: `Expected ${changesetPath.path} to be a file during planning.`,
      });
    }

    fileClassifications.set(
      changesetPath.path,
      snapshotPath.contents === changesetPath.authoritativeContents
        ? "unchanged"
        : "modify",
    );
  }

  const entries: Array<(typeof Plan.Type)["entries"][number]> = [
    ...directoryPaths.map((path) => ({
      _tag: "directory" as const,
      path,
      causes:
        directoryCauseMap.get(path) ??
        ([{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }] as const),
    })),
    ...changeset.paths.map((changesetPath) => ({
      _tag: "file" as const,
      path: changesetPath.path,
      classification: fileClassifications.get(changesetPath.path) ?? "create",
      causes: changesetPath.causes,
    })),
  ].sort((left, right) => sortPaths(left.path, right.path));

  type MutableTreeDirectoryNode = {
    _tag: "directory";
    name: string;
    path: string;
    causes: readonly [PlanCause, ...Array<PlanCause>];
    children: Array<PlanTreeNode>;
  };

  const root: MutableTreeDirectoryNode = {
    _tag: "directory",
    name: ".",
    path: ".",
    causes: rootCauses,
    children: [],
  };
  const directories = new Map<string, MutableTreeDirectoryNode>([[".", root]]);

  for (const path of directoryPaths) {
    const parentPath = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : ".";
    const node: MutableTreeDirectoryNode = {
      _tag: "directory",
      name: nameFromPath(path),
      path,
      causes:
        directoryCauseMap.get(path) ??
        ([{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }] as const),
      children: [],
    };

    directories.set(path, node);
    directories.get(parentPath)?.children.push(node);
  }

  for (const changesetPath of changeset.paths) {
    const parentPath = changesetPath.path.includes("/")
      ? changesetPath.path.slice(0, changesetPath.path.lastIndexOf("/"))
      : ".";

    directories.get(parentPath)?.children.push({
      _tag: "file",
      name: nameFromPath(changesetPath.path),
      path: changesetPath.path,
      classification: (() => {
        const entry = entries.find(
          (planEntry) =>
            planEntry._tag === "file" && planEntry.path === changesetPath.path,
        );

        return entry?._tag === "file" ? entry.classification : "create";
      })(),
      causes: fileCauseMap.get(changesetPath.path) ?? changesetPath.causes,
    });
  }

  for (const directory of directories.values()) {
    directory.children.sort((left, right) => {
      if (left._tag !== right._tag) {
        return left._tag === "directory" ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
  }

  return {
    entries,
    tree: root,
    mergeRequirements,
    warnings,
  } satisfies typeof Plan.Type;
};
export const planTsconfigMerge = ({
  path,
  projectedTsconfig,
  snapshotPath,
}: {
  path: string;
  projectedTsconfig: ProjectedTsconfig;
  snapshotPath: RepoSnapshotPath | undefined;
}) => {
  if (snapshotPath === undefined || snapshotPath._tag === "missing") {
    return {
      classification: "create" as const,
      mergeRequirements: [] as Array<MergeRequirement>,
      warnings: [] as Array<PlanWarning>,
    };
  }

  if (snapshotPath._tag !== "file") {
    throw new PlanFailure({
      reason: "repoRootNotEmpty",
      message: `Expected ${path} to be a file during planning.`,
    });
  }

  if (snapshotPath.contents === projectedTsconfig.contents) {
    return {
      classification: "unchanged" as const,
      mergeRequirements: [] as Array<MergeRequirement>,
      warnings: [] as Array<PlanWarning>,
    };
  }

  const requirement = createTsconfigMergeRequirement({
    path,
    causes: projectedTsconfig.causes,
  });

  return {
    classification: "needsMergeStrategy" as const,
    mergeRequirements: [requirement],
    warnings: [createTsconfigMergeWarning(requirement)],
  };
};
export const planPackageJsonMerge = ({
  path,
  projectedExports,
  projectedDependencies,
  projectedScripts,
  snapshotPath,
}: {
  path: string;
  projectedExports: ReadonlyArray<ProjectedPackageJsonExport>;
  projectedDependencies: ReadonlyArray<ProjectedPackageJsonDependency>;
  projectedScripts: ReadonlyArray<ProjectedPackageJsonScript>;
  snapshotPath: RepoSnapshotPath | undefined;
}) => {
  if (snapshotPath === undefined || snapshotPath._tag === "missing") {
    return {
      classification: "create" as const,
      mergeRequirements: [] as Array<MergeRequirement>,
      warnings: [] as Array<PlanWarning>,
    };
  }

  if (snapshotPath._tag !== "file") {
    throw new PlanFailure({
      reason: "repoRootNotEmpty",
      message: `Expected ${path} to be a file during planning.`,
    });
  }

  const packageJson = (() => {
    try {
      return JSON.parse(snapshotPath.contents) as unknown;
    } catch {
      return undefined;
    }
  })();

  if (!isRecord(packageJson)) {
    const mergeRequirements = [
      ...projectedExports.map((projectedExport) =>
        createPackageJsonExportMergeRequirement({ path, projectedExport }),
      ),
      ...projectedDependencies.map((projectedDependency) =>
        createPackageJsonDependencyMergeRequirement({
          path,
          projectedDependency,
        }),
      ),
      ...projectedScripts.map((projectedScript) =>
        createPackageJsonScriptMergeRequirement({
          path,
          projectedScript,
        }),
      ),
    ];

    return {
      classification: "needsMergeStrategy" as const,
      mergeRequirements,
      warnings: mergeRequirements.map((requirement) =>
        requirement._tag === "packageJsonExports"
          ? createPackageJsonExportMergeWarning(requirement)
          : requirement._tag === "packageJsonDependencies"
            ? createPackageJsonDependencyMergeWarning(requirement)
            : createPackageJsonScriptMergeWarning(requirement),
      ),
    };
  }

  const { exports: exportsValue, scripts: scriptsValue } = packageJson;
  const mergeRequirements: Array<MergeRequirement> = [];
  let hasAdditions = false;

  if (exportsValue !== undefined && !isFlatStringRecord(exportsValue)) {
    mergeRequirements.push(
      ...projectedExports.map((projectedExport) =>
        createPackageJsonExportMergeRequirement({ path, projectedExport }),
      ),
    );
  } else {
    const existingExports = exportsValue ?? {};

    for (const projectedExport of projectedExports) {
      const existingValue = existingExports[projectedExport.exportKey];

      if (existingValue === undefined) {
        hasAdditions = true;
        continue;
      }

      if (existingValue !== projectedExport.exportValue) {
        mergeRequirements.push(
          createPackageJsonExportMergeRequirement({ path, projectedExport }),
        );
      }
    }
  }

  const projectedDependenciesBySection = new Map<
    string,
    Array<ProjectedPackageJsonDependency>
  >();

  for (const projectedDependency of projectedDependencies) {
    const sectionDependencies =
      projectedDependenciesBySection.get(projectedDependency.section) ?? [];

    sectionDependencies.push(projectedDependency);
    projectedDependenciesBySection.set(
      projectedDependency.section,
      sectionDependencies,
    );
  }

  for (const [section, sectionDependencies] of projectedDependenciesBySection) {
    const sectionValue = packageJson[section];

    if (sectionValue !== undefined && !isFlatStringRecord(sectionValue)) {
      mergeRequirements.push(
        ...sectionDependencies.map((projectedDependency) =>
          createPackageJsonDependencyMergeRequirement({
            path,
            projectedDependency,
          }),
        ),
      );
      continue;
    }

    const existingDependencies = sectionValue ?? {};

    for (const projectedDependency of sectionDependencies) {
      const existingValue =
        existingDependencies[projectedDependency.dependencyName];

      if (existingValue === undefined) {
        hasAdditions = true;
        continue;
      }

      if (existingValue !== projectedDependency.dependencyValue) {
        mergeRequirements.push(
          createPackageJsonDependencyMergeRequirement({
            path,
            projectedDependency,
          }),
        );
      }
    }
  }

  if (scriptsValue !== undefined && !isFlatStringRecord(scriptsValue)) {
    mergeRequirements.push(
      ...projectedScripts.map((projectedScript) =>
        createPackageJsonScriptMergeRequirement({
          path,
          projectedScript,
        }),
      ),
    );
  } else {
    const existingScripts = scriptsValue ?? {};

    for (const projectedScript of projectedScripts) {
      const existingValue = existingScripts[projectedScript.scriptName];

      if (existingValue === undefined) {
        hasAdditions = true;
        continue;
      }

      if (existingValue !== projectedScript.scriptValue) {
        mergeRequirements.push(
          createPackageJsonScriptMergeRequirement({
            path,
            projectedScript,
          }),
        );
      }
    }
  }

  if (mergeRequirements.length > 0) {
    return {
      classification: "needsMergeStrategy" as const,
      mergeRequirements,
      warnings: mergeRequirements.map((requirement) =>
        requirement._tag === "packageJsonExports"
          ? createPackageJsonExportMergeWarning(requirement)
          : requirement._tag === "packageJsonDependencies"
            ? createPackageJsonDependencyMergeWarning(requirement)
            : createPackageJsonScriptMergeWarning(requirement),
      ),
    };
  }

  return {
    classification: hasAdditions ? ("modify" as const) : ("unchanged" as const),
    mergeRequirements: [] as Array<MergeRequirement>,
    warnings: [] as Array<PlanWarning>,
  };
};
export const planBarrelMerge = ({
  path,
  projectedBarrelExports,
  snapshotPath,
}: {
  path: string;
  projectedBarrelExports: ReadonlyArray<ProjectedBarrelExport>;
  snapshotPath: RepoSnapshotPath | undefined;
}) => {
  if (snapshotPath === undefined || snapshotPath._tag === "missing") {
    return {
      classification: "create" as const,
      mergeRequirements: [] as Array<MergeRequirement>,
      warnings: [] as Array<PlanWarning>,
    };
  }

  if (snapshotPath._tag !== "file") {
    throw new PlanFailure({
      reason: "repoRootNotEmpty",
      message: `Expected ${path} to be a file during planning.`,
    });
  }

  const existingExports = parseSimpleBarrelExports(snapshotPath.contents);

  if (existingExports === undefined) {
    const mergeRequirements = projectedBarrelExports.map(
      (projectedBarrelExport) =>
        createBarrelExportMergeRequirement({ path, projectedBarrelExport }),
    );

    return {
      classification: "needsMergeStrategy" as const,
      mergeRequirements,
      warnings: mergeRequirements.map((requirement) =>
        createBarrelExportMergeWarning(requirement),
      ),
    };
  }

  const existingExportsSet = new Set(existingExports);
  let hasAdditions = false;

  for (const projectedBarrelExport of projectedBarrelExports) {
    if (existingExportsSet.has(projectedBarrelExport.exportPath)) {
      continue;
    }

    hasAdditions = true;
  }

  return {
    classification: hasAdditions ? ("modify" as const) : ("unchanged" as const),
    mergeRequirements: [] as Array<MergeRequirement>,
    warnings: [] as Array<PlanWarning>,
  };
};
export const parseSimpleBarrelExports = (contents: string) => {
  const exports: Array<string> = [];

  for (const line of contents.split(/\r?\n/u)) {
    if (line.trim() === "") {
      continue;
    }

    const matched = line.match(simpleBarrelExportPattern);

    if (matched === null) {
      return undefined;
    }

    const exportPath = matched[1];

    if (exportPath === undefined) {
      return undefined;
    }

    exports.push(exportPath);
  }

  return exports;
};
export const simpleBarrelExportPattern = /^export \* from "(\.[^"]*)";$/;
export const createTsconfigMergeWarning = (
  requirement: MergeRequirement,
): PlanWarning => ({
  _tag: "mergeStrategyRequired",
  path: requirement.path,
  message: "Existing tsconfig.json requires manual merge strategy.",
  requirement,
});
export const createTsconfigMergeRequirement = ({
  path,
  causes,
}: {
  path: string;
  causes: readonly [PlanCause, ...Array<PlanCause>];
}): MergeRequirement => ({
  _tag: "tsconfig",
  path,
  causes,
});
export const createBarrelExportMergeRequirement = ({
  path,
  projectedBarrelExport,
}: {
  path: string;
  projectedBarrelExport: ProjectedBarrelExport;
}): MergeRequirement => ({
  _tag: "barrelExport",
  path,
  exportPath: projectedBarrelExport.exportPath,
  causes: projectedBarrelExport.causes,
});
export const createBarrelExportMergeWarning = (
  requirement: MergeRequirement,
): PlanWarning => ({
  _tag: "mergeStrategyRequired",
  path: requirement.path,
  message: "Existing barrel exports require manual merge strategy.",
  requirement,
});
export const createPackageJsonExportMergeRequirement = ({
  path,
  projectedExport,
}: {
  path: string;
  projectedExport: ProjectedPackageJsonExport;
}): MergeRequirement => ({
  _tag: "packageJsonExports",
  path,
  exportKey: projectedExport.exportKey,
  causes: projectedExport.causes,
});
export const createPackageJsonScriptMergeRequirement = ({
  path,
  projectedScript,
}: {
  path: string;
  projectedScript: ProjectedPackageJsonScript;
}): MergeRequirement => ({
  _tag: "packageJsonScripts",
  path,
  scriptName: projectedScript.scriptName,
  causes: projectedScript.causes,
});
export const createPackageJsonScriptMergeWarning = (
  requirement: MergeRequirement,
): PlanWarning => ({
  _tag: "mergeStrategyRequired",
  path: requirement.path,
  message: "Existing scripts require manual merge strategy.",
  requirement,
});
export const createPackageJsonDependencyMergeRequirement = ({
  path,
  projectedDependency,
}: {
  path: string;
  projectedDependency: ProjectedPackageJsonDependency;
}): MergeRequirement => ({
  _tag: "packageJsonDependencies",
  path,
  section: projectedDependency.section,
  dependencyName: projectedDependency.dependencyName,
  causes: projectedDependency.causes,
});

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isFlatStringRecord = (
  value: unknown,
): value is Record<string, string> =>
  isRecord(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

export const createPackageJsonExportMergeWarning = (
  requirement: MergeRequirement,
): PlanWarning => ({
  _tag: "mergeStrategyRequired",
  path: requirement.path,
  message: "Existing exports require manual merge strategy.",
  requirement,
});

export const createPackageJsonDependencyMergeWarning = (
  requirement: MergeRequirement,
): PlanWarning => ({
  _tag: "mergeStrategyRequired",
  path: requirement.path,
  message:
    requirement._tag === "packageJsonDependencies"
      ? `Existing ${requirement.section} require manual merge strategy.`
      : "Existing dependencies require manual merge strategy.",
  requirement,
});

export const sortPaths = (left: string, right: string) => {
  const leftParts = left.split("/");
  const rightParts = right.split("/");
  const length = Math.min(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];

    if (leftPart === undefined || rightPart === undefined) {
      continue;
    }

    const compared = leftPart.localeCompare(rightPart);

    if (compared !== 0) {
      return compared;
    }
  }

  return leftParts.length - rightParts.length;
};

const sortCauses = (
  causes: ReadonlyArray<PlanCause>,
): [PlanCause, ...Array<PlanCause>] =>
  [...causes].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  ) as [PlanCause, ...Array<PlanCause>];

export const collectDirectoryPaths = (paths: ReadonlyArray<string>) => {
  const directories = new Set<string>();

  for (const path of paths) {
    const parts = path.split("/");

    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }

  return [...directories].sort(sortPaths);
};

type ProjectedPlanPath = {
  readonly path: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedPackageJsonExport = {
  readonly exportKey: string;
  readonly exportValue: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedPackageJsonDependency = {
  readonly section: "dependencies" | "devDependencies";
  readonly dependencyName: string;
  readonly dependencyValue: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedPackageJsonScript = {
  readonly scriptName: string;
  readonly scriptValue: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedBarrelExport = {
  readonly exportPath: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedTsconfig = {
  readonly path: string;
  readonly contents: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type PlanChangesetPath = {
  readonly path: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
  readonly authoritativeContents: string | undefined;
  readonly packageJsonExports: ReadonlyArray<ProjectedPackageJsonExport>;
  readonly packageJsonDependencies: ReadonlyArray<ProjectedPackageJsonDependency>;
  readonly packageJsonScripts: ReadonlyArray<ProjectedPackageJsonScript>;
  readonly barrelExports: ReadonlyArray<ProjectedBarrelExport>;
  readonly tsconfig: ProjectedTsconfig | undefined;
};

export type PlanChangeset = {
  readonly paths: ReadonlyArray<PlanChangesetPath>;
};

export type PlanChangesetOperationFamily =
  | "authoritative"
  | "packageJson"
  | "barrel"
  | "tsconfig";

export type MutablePlanChangesetPath = {
  readonly path: string;
  causes: readonly [PlanCause, ...Array<PlanCause>];
  family?: PlanChangesetOperationFamily;
  authoritativeContents?: string;
  readonly packageJsonExports: Array<ProjectedPackageJsonExport>;
  readonly packageJsonDependencies: Array<ProjectedPackageJsonDependency>;
  readonly packageJsonScripts: Array<ProjectedPackageJsonScript>;
  readonly barrelExports: Array<ProjectedBarrelExport>;
  tsconfig?: ProjectedTsconfig;
};

const appendProjectedPath = (
  projectedPaths: Map<string, ProjectedPlanPath>,
  path: string,
  causes: ReadonlyArray<PlanCause>,
) => {
  const current = projectedPaths.get(path);

  projectedPaths.set(path, {
    path,
    causes: current
      ? mergePlanCauses(current.causes, causes)
      : sortCauses(causes),
  });
};

const appendProjectedPackageJsonExport = (
  projectedExports: Map<string, ProjectedPackageJsonExport>,
  exportKey: string,
  exportValue: string,
  causes: ReadonlyArray<PlanCause>,
) => {
  const current = projectedExports.get(exportKey);

  projectedExports.set(exportKey, {
    exportKey,
    exportValue,
    causes: current
      ? mergePlanCauses(current.causes, causes)
      : sortCauses(causes),
  });
};

const appendProjectedPackageJsonDependency = (
  projectedDependencies: Map<string, ProjectedPackageJsonDependency>,
  dependency: ProjectedPackageJsonDependency,
) => {
  const key = `${dependency.section}:${dependency.dependencyName}`;
  const current = projectedDependencies.get(key);

  projectedDependencies.set(key, {
    section: dependency.section,
    dependencyName: dependency.dependencyName,
    dependencyValue: dependency.dependencyValue,
    causes: current
      ? mergePlanCauses(current.causes, dependency.causes)
      : sortCauses(dependency.causes),
  });
};

const appendProjectedPackageJsonScript = (
  projectedScripts: Map<string, ProjectedPackageJsonScript>,
  script: ProjectedPackageJsonScript,
) => {
  const current = projectedScripts.get(script.scriptName);

  projectedScripts.set(script.scriptName, {
    scriptName: script.scriptName,
    scriptValue: script.scriptValue,
    causes: current
      ? mergePlanCauses(current.causes, script.causes)
      : sortCauses(script.causes),
  });
};

const appendProjectedBarrelExport = (
  projectedBarrelExports: Map<string, ProjectedBarrelExport>,
  exportPath: string,
  causes: ReadonlyArray<PlanCause>,
) => {
  const current = projectedBarrelExports.get(exportPath);

  projectedBarrelExports.set(exportPath, {
    exportPath,
    causes: current
      ? mergePlanCauses(current.causes, causes)
      : sortCauses(causes),
  });
};

const appendProjectedTsconfig = (
  projectedTsconfigs: Map<string, ProjectedTsconfig>,
  projectedTsconfig: ProjectedTsconfig,
) => {
  const current = projectedTsconfigs.get(projectedTsconfig.path);

  projectedTsconfigs.set(projectedTsconfig.path, {
    path: projectedTsconfig.path,
    contents: projectedTsconfig.contents,
    causes: current
      ? mergePlanCauses(current.causes, projectedTsconfig.causes)
      : sortCauses(projectedTsconfig.causes),
  });
};

const isServerTarget = (target: ResolvedTarget) =>
  target.id === "apps/server-api";

const isDomainPackageTarget = (target: ResolvedTarget) =>
  target.id === "packages/domain";

const toRootBootstrapCauses = (
  repoModule: ResolvedRepoModule,
): readonly [PlanCause, ...Array<PlanCause>] =>
  toPlanRepoModuleCauses({ repoModule });

const getRepoOnlyRootBootstrapCauses = (blueprint: Blueprint) => {
  if (blueprint.nodes.length > 0) {
    return undefined;
  }

  const rootBootstrap = blueprint.modules.find(
    (repoModule) => repoModule.moduleId === "root-bootstrap",
  );

  return rootBootstrap === undefined
    ? undefined
    : toRootBootstrapCauses(rootBootstrap);
};

const collectProjectedRootBootstrapPaths = (blueprint: Blueprint) => {
  const rootBootstrapCauses = getRepoOnlyRootBootstrapCauses(blueprint);

  if (rootBootstrapCauses === undefined) {
    return [];
  }

  return Object.keys(rootBootstrapFiles)
    .sort(sortPaths)
    .map((path) => ({
      path,
      causes: rootBootstrapCauses,
    })) satisfies Array<ProjectedPlanPath>;
};

const projectServerTargetPaths = (target: ResolvedTarget) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();
  const targetCauses = toPlanTargetCauses({ target });

  appendProjectedPath(projectedPaths, "apps/server/package.json", targetCauses);
  appendProjectedPath(
    projectedPaths,
    "apps/server/tsconfig.json",
    targetCauses,
  );
  appendProjectedPath(projectedPaths, "apps/server/src/index.ts", targetCauses);

  for (const targetModule of target.targetModules) {
    if (targetModule.moduleId !== "http-api-server") {
      continue;
    }

    const targetModuleCauses = toPlanTargetModuleCauses({
      targetId: target.id,
      targetModule,
    });

    appendProjectedPath(
      projectedPaths,
      "apps/server/src/index.ts",
      targetModuleCauses,
    );
    appendProjectedPath(
      projectedPaths,
      "apps/server/src/Api/Health.ts",
      targetModuleCauses,
    );
    appendProjectedPath(
      projectedPaths,
      "apps/server/src/Api/Hello.ts",
      targetModuleCauses,
    );
  }

  return [...projectedPaths.values()].sort((left, right) =>
    sortPaths(left.path, right.path),
  );
};

const projectDomainPackageTargetPaths = (target: ResolvedTarget) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();
  const targetCauses = toPlanTargetCauses({ target });

  appendProjectedPath(
    projectedPaths,
    "packages/domain/package.json",
    targetCauses,
  );
  appendProjectedPath(
    projectedPaths,
    "packages/domain/tsconfig.json",
    targetCauses,
  );

  if (
    target.composition?._tag === "package" &&
    target.composition.publicEntrypoint === "./Api"
  ) {
    const compositionCauses = toPlanTargetCompositionCauses({
      target,
      composition: target.composition,
    });

    appendProjectedPath(
      projectedPaths,
      "packages/domain/package.json",
      compositionCauses,
    );
    appendProjectedPath(
      projectedPaths,
      "packages/domain/src/index.ts",
      compositionCauses,
    );
  }

  for (const targetModule of target.targetModules) {
    if (targetModule.moduleId !== "domain-api") {
      continue;
    }

    appendProjectedPath(
      projectedPaths,
      "packages/domain/src/Api.ts",
      toPlanTargetModuleCauses({
        targetId: target.id,
        targetModule,
      }),
    );
  }

  return [...projectedPaths.values()].sort((left, right) =>
    sortPaths(left.path, right.path),
  );
};

export const collectProjectedPlanPaths = (blueprint: Blueprint) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();

  for (const projectedPath of collectProjectedRootBootstrapPaths(blueprint)) {
    appendProjectedPath(
      projectedPaths,
      projectedPath.path,
      projectedPath.causes,
    );
  }

  for (const target of blueprint.nodes) {
    const targetProjectedPaths = (() => {
      if (isServerTarget(target)) {
        return projectServerTargetPaths(target);
      }

      if (isDomainPackageTarget(target)) {
        return projectDomainPackageTargetPaths(target);
      }

      return [];
    })();

    for (const projectedPath of targetProjectedPaths) {
      appendProjectedPath(
        projectedPaths,
        projectedPath.path,
        projectedPath.causes,
      );
    }
  }

  return [...projectedPaths.values()].sort((left, right) =>
    sortPaths(left.path, right.path),
  );
};

export const collectProjectedContents = (blueprint: Blueprint) => {
  const projectedContents = new Map<string, string>(
    Object.entries(rootBootstrapFiles)
      .filter(() => getRepoOnlyRootBootstrapCauses(blueprint) !== undefined)
      .map(([path, contents]) => [path, contents] as const),
  );

  for (const target of blueprint.nodes) {
    if (isServerTarget(target)) {
      projectedContents.set("apps/server/src/index.ts", serverIndexContents);

      for (const targetModule of target.targetModules) {
        if (targetModule.moduleId !== "http-api-server") {
          continue;
        }

        projectedContents.set(
          "apps/server/src/Api/Health.ts",
          serverHealthContents,
        );
        projectedContents.set(
          "apps/server/src/Api/Hello.ts",
          serverHelloContents,
        );
      }
    }

    if (!isDomainPackageTarget(target)) {
      continue;
    }

    for (const targetModule of target.targetModules) {
      if (targetModule.moduleId !== "domain-api") {
        continue;
      }

      projectedContents.set("packages/domain/src/Api.ts", domainApiContents);
    }
  }

  return projectedContents;
};

export const collectProjectedPackageJsonExports = (blueprint: Blueprint) => {
  const projectedExportsByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonExport>
  >();

  for (const target of blueprint.nodes) {
    if (
      !isDomainPackageTarget(target) ||
      target.composition?._tag !== "package" ||
      target.composition.publicEntrypoint !== "./Api"
    ) {
      continue;
    }

    const path = "packages/domain/package.json";
    const pathExports =
      projectedExportsByPath.get(path) ??
      new Map<string, ProjectedPackageJsonExport>();
    const compositionCauses = toPlanTargetCompositionCauses({
      target,
      composition: target.composition,
    });

    appendProjectedPackageJsonExport(
      pathExports,
      "./Api",
      "./src/Api.ts",
      compositionCauses,
    );
    projectedExportsByPath.set(path, pathExports);
  }

  return new Map(
    [...projectedExportsByPath.entries()].map(([path, projectedExports]) => [
      path,
      [...projectedExports.values()].sort((left, right) =>
        left.exportKey.localeCompare(right.exportKey),
      ),
    ]),
  );
};

export const collectProjectedPackageJsonDependencies = (
  blueprint: Blueprint,
) => {
  const projectedDependenciesByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonDependency>
  >();

  for (const target of blueprint.nodes) {
    if (!isDomainPackageTarget(target)) {
      continue;
    }

    const path = "packages/domain/package.json";
    const pathDependencies =
      projectedDependenciesByPath.get(path) ??
      new Map<string, ProjectedPackageJsonDependency>();
    const targetCauses = toPlanTargetCauses({ target });

    appendProjectedPackageJsonDependency(pathDependencies, {
      section: "dependencies",
      dependencyName: "effect",
      dependencyValue: "4.0.0-beta.47",
      causes: targetCauses,
    });
    appendProjectedPackageJsonDependency(pathDependencies, {
      section: "devDependencies",
      dependencyName: "@repo/config-typescript",
      dependencyValue: "workspace:*",
      causes: targetCauses,
    });
    projectedDependenciesByPath.set(path, pathDependencies);
  }

  return new Map(
    [...projectedDependenciesByPath.entries()].map(
      ([path, projectedDependencies]) => [
        path,
        [...projectedDependencies.values()].sort((left, right) => {
          const sectionCompared = left.section.localeCompare(right.section);

          if (sectionCompared !== 0) {
            return sectionCompared;
          }

          return left.dependencyName.localeCompare(right.dependencyName);
        }),
      ],
    ),
  );
};

export const collectProjectedPackageJsonScripts = (blueprint: Blueprint) => {
  const projectedScriptsByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonScript>
  >();

  for (const target of blueprint.nodes) {
    if (isServerTarget(target)) {
      const path = "apps/server/package.json";
      const pathScripts =
        projectedScriptsByPath.get(path) ??
        new Map<string, ProjectedPackageJsonScript>();
      const targetCauses = toPlanTargetCauses({ target });

      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "build",
        scriptValue:
          "bun build src/index.ts --outdir=dist --target=bun --minify",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "build:types",
        scriptValue: "tsc --emitDeclarationOnly",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "dev",
        scriptValue: "bun --watch run src/index.ts",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "test",
        scriptValue: "vitest run",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "type-check",
        scriptValue: "tsc --noEmit",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "clean",
        scriptValue: "git clean -xdf .cache .turbo dist node_modules",
        causes: targetCauses,
      });
      projectedScriptsByPath.set(path, pathScripts);
      continue;
    }

    if (!isDomainPackageTarget(target)) {
      continue;
    }

    const path = "packages/domain/package.json";
    const pathScripts =
      projectedScriptsByPath.get(path) ??
      new Map<string, ProjectedPackageJsonScript>();
    const targetCauses = toPlanTargetCauses({ target });

    appendProjectedPackageJsonScript(pathScripts, {
      scriptName: "type-check",
      scriptValue: "tsc --noEmit",
      causes: targetCauses,
    });
    appendProjectedPackageJsonScript(pathScripts, {
      scriptName: "clean",
      scriptValue:
        "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
      causes: targetCauses,
    });
    projectedScriptsByPath.set(path, pathScripts);
  }

  return new Map(
    [...projectedScriptsByPath.entries()].map(([path, projectedScripts]) => [
      path,
      [...projectedScripts.values()].sort((left, right) =>
        left.scriptName.localeCompare(right.scriptName),
      ),
    ]),
  );
};

export const collectProjectedBarrelExports = (blueprint: Blueprint) => {
  const projectedBarrelExportsByPath = new Map<
    string,
    Map<string, ProjectedBarrelExport>
  >();

  for (const target of blueprint.nodes) {
    if (
      !isDomainPackageTarget(target) ||
      target.composition?._tag !== "package" ||
      target.composition.publicEntrypoint !== "./Api"
    ) {
      continue;
    }

    const path = "packages/domain/src/index.ts";
    const pathBarrelExports =
      projectedBarrelExportsByPath.get(path) ??
      new Map<string, ProjectedBarrelExport>();

    appendProjectedBarrelExport(
      pathBarrelExports,
      "./Api",
      toPlanTargetCompositionCauses({
        target,
        composition: target.composition,
      }),
    );
    projectedBarrelExportsByPath.set(path, pathBarrelExports);
  }

  return new Map(
    [...projectedBarrelExportsByPath.entries()].map(
      ([path, projectedBarrelExports]) => [
        path,
        [...projectedBarrelExports.values()].sort((left, right) =>
          left.exportPath.localeCompare(right.exportPath),
        ),
      ],
    ),
  );
};

export const collectProjectedTsconfigs = (blueprint: Blueprint) => {
  const projectedTsconfigs = new Map<string, ProjectedTsconfig>();

  for (const target of blueprint.nodes) {
    if (isServerTarget(target)) {
      appendProjectedTsconfig(projectedTsconfigs, {
        path: "apps/server/tsconfig.json",
        contents: serverTsconfigContents,
        causes: toPlanTargetCauses({ target }),
      });
      continue;
    }

    if (isDomainPackageTarget(target)) {
      appendProjectedTsconfig(projectedTsconfigs, {
        path: "packages/domain/tsconfig.json",
        contents: packageDomainTsconfigContents,
        causes: toPlanTargetCauses({ target }),
      });
    }
  }

  return new Map(projectedTsconfigs.entries());
};

export const getOrCreatePlanChangesetPath = (
  changesetPaths: Map<string, MutablePlanChangesetPath>,
  path: string,
  causes: readonly [PlanCause, ...Array<PlanCause>],
) => {
  const current = changesetPaths.get(path);

  if (current !== undefined) {
    current.causes = mergePlanCauses(current.causes, causes);
    return current;
  }

  const next: MutablePlanChangesetPath = {
    path,
    causes,
    packageJsonExports: [],
    packageJsonDependencies: [],
    packageJsonScripts: [],
    barrelExports: [],
  };

  changesetPaths.set(path, next);
  return next;
};

export const nameFromPath = (path: string) => {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
};
