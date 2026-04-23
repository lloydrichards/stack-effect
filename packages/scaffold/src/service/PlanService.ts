import type { Blueprint } from "@repo/domain/Blueprint";
import { pathOrd } from "@repo/domain/Order";
import {
  Plan,
  type PlanConflict,
  type PlanEntryClassification,
  PlanFailure,
  type PlanTreeNode,
  type RepoSnapshot,
  type RepoSnapshotPath,
} from "@repo/domain/Plan";
import { Array as Arr, Context, Effect, Layer, Order, Record } from "effect";
import {
  ContributionResolver,
  type NormalizedContributions,
} from "./ContributionResolver";
import { RepoSnapshotService } from "./RepoSnapshotService";

const planPathOrd = Order.mapInput(
  pathOrd,
  (value: { path: string }) => value.path,
);

const projectedPackageJsonExportOrd = Order.mapInput(
  Order.String,
  (value: { exportKey: string }) => value.exportKey,
);

const projectedPackageJsonDependencyOrd = Order.combineAll([
  Order.mapInput(Order.String, (value: { section: string }) => value.section),
  Order.mapInput(
    Order.String,
    (value: { section: string; dependencyName: string }) =>
      value.dependencyName,
  ),
]);

const projectedPackageJsonScriptOrd = Order.mapInput(
  Order.String,
  (value: { scriptName: string }) => value.scriptName,
);

const projectedBarrelExportOrd = Order.mapInput(
  Order.String,
  (value: { exportPath: string }) => value.exportPath,
);

export class PlanService extends Context.Service<PlanService>()("PlanService", {
  make: Effect.gen(function* () {
    const snapshot = yield* RepoSnapshotService;
    const contributionResolver = yield* ContributionResolver;

    const build = Effect.fn("PlanService.build")(function* ({
      blueprint,
      repoRoot,
    }: {
      blueprint: typeof Blueprint.Type;
      repoRoot: string;
    }) {
      const normalizedContributions = yield* contributionResolver.resolve({
        blueprint,
      });
      const changeset = compilePlanChangeset(normalizedContributions);
      const inspectionPaths = collectPlanInspectionPaths(changeset);
      const repoSnapshot = yield* snapshot.load({
        paths: inspectionPaths,
        repoRoot,
      });

      return projectPlan({ changeset, repoSnapshot });
    });

    return { build } as const;
  }),
}) {
  static readonly layer = Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(RepoSnapshotService.layer),
  );
}
const compilePlanChangeset = (
  normalizedContributions: NormalizedContributions,
): PlanChangeset => {
  const changesetPaths = new Map<string, MutablePlanChangesetPath>();
  const projectedPaths = collectProjectedPlanPaths(normalizedContributions);
  const projectedContents = collectProjectedContents(normalizedContributions);
  const projectedPackageJsonExports = collectProjectedPackageJsonExports(
    normalizedContributions,
  );
  const projectedPackageJsonDependencies =
    collectProjectedPackageJsonDependencies(normalizedContributions);
  const projectedPackageJsonScripts = collectProjectedPackageJsonScripts(
    normalizedContributions,
  );
  const projectedBarrelExports = collectProjectedBarrelExports(
    normalizedContributions,
  );
  const projectedTsconfigs = collectProjectedTsconfigs(normalizedContributions);

  for (const projectedPath of projectedPaths) {
    getOrCreatePlanChangesetPath(changesetPaths, projectedPath.path);
  }

  for (const [path, contents] of projectedContents) {
    const pathEntry =
      changesetPaths.get(path) ??
      getOrCreatePlanChangesetPath(changesetPaths, path);

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
    const pathEntry = getOrCreatePlanChangesetPath(changesetPaths, path);

    assertPlanChangesetFamily({ pathEntry, family: "packageJson" });
    pathEntry.packageJsonExports.push(...projectedExports);
  }

  for (const [
    path,
    projectedDependencies,
  ] of projectedPackageJsonDependencies) {
    const pathEntry = getOrCreatePlanChangesetPath(changesetPaths, path);

    assertPlanChangesetFamily({ pathEntry, family: "packageJson" });
    pathEntry.packageJsonDependencies.push(...projectedDependencies);
  }

  for (const [path, projectedScripts] of projectedPackageJsonScripts) {
    const pathEntry = getOrCreatePlanChangesetPath(changesetPaths, path);

    assertPlanChangesetFamily({ pathEntry, family: "packageJson" });
    pathEntry.packageJsonScripts.push(...projectedScripts);
  }

  for (const [path, projectedExports] of projectedBarrelExports) {
    const pathEntry = getOrCreatePlanChangesetPath(changesetPaths, path);

    assertPlanChangesetFamily({ pathEntry, family: "barrel" });
    pathEntry.barrelExports.push(...projectedExports);
  }

  for (const [path, projectedTsconfig] of projectedTsconfigs) {
    const pathEntry = getOrCreatePlanChangesetPath(changesetPaths, path);

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
    paths: Arr.sort(changesetPaths.values(), planPathOrd).map((pathEntry) => ({
      path: pathEntry.path,
      authoritativeContents: pathEntry.authoritativeContents,
      packageJsonExports: Arr.fromIterable(pathEntry.packageJsonExports),
      packageJsonDependencies: Arr.fromIterable(
        pathEntry.packageJsonDependencies,
      ),
      packageJsonScripts: Arr.fromIterable(pathEntry.packageJsonScripts),
      barrelExports: Arr.fromIterable(pathEntry.barrelExports),
      tsconfig: pathEntry.tsconfig,
    })),
  };
};
const collectPlanInspectionPaths = (changeset: PlanChangeset) => {
  const requestedPaths = new Set<string>();

  for (const changesetPath of changeset.paths) {
    requestedPaths.add(changesetPath.path);
  }

  for (const directoryPath of collectDirectoryPaths(
    changeset.paths.map((changesetPath) => changesetPath.path),
  )) {
    requestedPaths.add(directoryPath);
  }

  return Arr.sort(requestedPaths, pathOrd);
};
const assertPlanChangesetFamily = ({
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
const projectPlan = ({
  changeset,
  repoSnapshot,
}: {
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

  const fileClassifications = new Map<string, PlanEntryClassification>();
  const conflicts: Array<PlanConflict> = [];
  const getFileClassification = (path: string): PlanEntryClassification =>
    fileClassifications.get(path) ?? "create";

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
      conflicts.push(...packageJsonMergePlan.conflicts);
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
      conflicts.push(...barrelMergePlan.conflicts);
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
      conflicts.push(...tsconfigMergePlan.conflicts);
      continue;
    }

    if (changesetPath.authoritativeContents === undefined) {
      throw new PlanFailure({
        reason: "invalidChangeset",
        message: `No planned operation defined for ${changesetPath.path}.`,
      });
    }

    const existingContents = getExistingFileContents({
      path: changesetPath.path,
      snapshotPath: snapshotPaths.get(changesetPath.path),
    });

    if (existingContents === undefined) {
      fileClassifications.set(changesetPath.path, "create");
      continue;
    }

    if (existingContents === changesetPath.authoritativeContents) {
      fileClassifications.set(changesetPath.path, "unchanged");
      continue;
    }

    fileClassifications.set(changesetPath.path, "modify");
  }

  const entries: Array<(typeof Plan.Type)["entries"][number]> = [
    ...directoryPaths.map((path) => ({ _tag: "directory" as const, path })),
    ...changeset.paths.map((changesetPath) => ({
      _tag: "file" as const,
      path: changesetPath.path,
      classification: getFileClassification(changesetPath.path),
    })),
  ];

  type MutableTreeDirectoryNode = {
    _tag: "directory";
    name: string;
    path: string;
    children: Array<PlanTreeNode>;
  };

  const root: MutableTreeDirectoryNode = {
    _tag: "directory",
    name: ".",
    path: ".",
    children: [],
  };
  const directories = new Map<string, MutableTreeDirectoryNode>([[".", root]]);

  for (const path of directoryPaths) {
    const parentPath = parentPathFromPath(path);
    const node: MutableTreeDirectoryNode = {
      _tag: "directory",
      name: nameFromPath(path),
      path,
      children: [],
    };

    directories.set(path, node);
    directories.get(parentPath)?.children.push(node);
  }

  for (const changesetPath of changeset.paths) {
    const parentPath = parentPathFromPath(changesetPath.path);

    directories.get(parentPath)?.children.push({
      _tag: "file",
      name: nameFromPath(changesetPath.path),
      path: changesetPath.path,
      classification: getFileClassification(changesetPath.path),
    });
  }

  return new Plan({
    entries,
    tree: root,
    conflicts,
  }).toSorted();
};
const planTsconfigMerge = ({
  path,
  projectedTsconfig,
  snapshotPath,
}: {
  path: string;
  projectedTsconfig: ProjectedTsconfig;
  snapshotPath: RepoSnapshotPath | undefined;
}) => {
  const existingContents = getExistingFileContents({ path, snapshotPath });

  if (existingContents === undefined) {
    return {
      classification: "create" as const,
      conflicts: [] as Array<PlanConflict>,
    };
  }

  if (existingContents === projectedTsconfig.contents) {
    return {
      classification: "unchanged" as const,
      conflicts: [] as Array<PlanConflict>,
    };
  }

  const conflict = createTsconfigPlanConflict({
    path,
  });

  return {
    classification: "needsMergeStrategy" as const,
    conflicts: [conflict],
  };
};
const planPackageJsonMerge = ({
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
  const existingContents = getExistingFileContents({ path, snapshotPath });

  if (existingContents === undefined) {
    return {
      classification: "create" as const,
      conflicts: [] as Array<PlanConflict>,
    };
  }

  const exportConflicts = projectedExports.map((projectedExport) =>
    createPackageJsonExportPlanConflict({ path, projectedExport }),
  );
  const dependencyConflicts = projectedDependencies.map((projectedDependency) =>
    createPackageJsonDependencyPlanConflict({
      path,
      projectedDependency,
    }),
  );
  const scriptConflicts = projectedScripts.map((projectedScript) =>
    createPackageJsonScriptPlanConflict({
      path,
      projectedScript,
    }),
  );
  const packageJson = parseJsonRecord(existingContents);

  if (packageJson === undefined) {
    const conflicts: Array<PackageJsonPlanConflict> = [
      ...exportConflicts,
      ...dependencyConflicts,
      ...scriptConflicts,
    ];

    return {
      classification: "needsMergeStrategy" as const,
      conflicts,
    };
  }

  const { exports: exportsValue, scripts: scriptsValue } = packageJson;
  const conflicts: Array<PackageJsonPlanConflict> = [];
  let hasAdditions = false;

  if (exportsValue !== undefined && !isFlatStringRecord(exportsValue)) {
    conflicts.push(...exportConflicts);
  } else {
    const existingExports = exportsValue ?? {};

    for (const projectedExport of projectedExports) {
      const existingValue = existingExports[projectedExport.exportKey];

      if (existingValue === undefined) {
        hasAdditions = true;
        continue;
      }

      if (existingValue !== projectedExport.exportValue) {
        conflicts.push(
          createPackageJsonExportPlanConflict({ path, projectedExport }),
        );
      }
    }
  }

  for (const [section, sectionDependencies] of Record.collect(
    Arr.groupBy(
      projectedDependencies,
      (projectedDependency) => projectedDependency.section,
    ),
    (section, sectionDependencies) => [section, sectionDependencies] as const,
  )) {
    const sectionValue = packageJson[section];

    if (sectionValue !== undefined && !isFlatStringRecord(sectionValue)) {
      conflicts.push(
        ...sectionDependencies.map((projectedDependency) =>
          createPackageJsonDependencyPlanConflict({
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
        conflicts.push(
          createPackageJsonDependencyPlanConflict({
            path,
            projectedDependency,
          }),
        );
      }
    }
  }

  if (scriptsValue !== undefined && !isFlatStringRecord(scriptsValue)) {
    conflicts.push(...scriptConflicts);
  } else {
    const existingScripts = scriptsValue ?? {};

    for (const projectedScript of projectedScripts) {
      const existingValue = existingScripts[projectedScript.scriptName];

      if (existingValue === undefined) {
        hasAdditions = true;
        continue;
      }

      if (existingValue !== projectedScript.scriptValue) {
        conflicts.push(
          createPackageJsonScriptPlanConflict({
            path,
            projectedScript,
          }),
        );
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      classification: "needsMergeStrategy" as const,
      conflicts,
    };
  }

  return {
    classification: hasAdditions ? ("modify" as const) : ("unchanged" as const),
    conflicts: [] as Array<PlanConflict>,
  };
};
const planBarrelMerge = ({
  path,
  projectedBarrelExports,
  snapshotPath,
}: {
  path: string;
  projectedBarrelExports: ReadonlyArray<ProjectedBarrelExport>;
  snapshotPath: RepoSnapshotPath | undefined;
}) => {
  const existingContents = getExistingFileContents({ path, snapshotPath });

  if (existingContents === undefined) {
    return {
      classification: "create" as const,
      conflicts: [] as Array<PlanConflict>,
    };
  }

  const existingExports = parseSimpleBarrelExports(existingContents);

  if (existingExports === undefined) {
    const conflicts = projectedBarrelExports.map((projectedBarrelExport) =>
      createBarrelExportPlanConflict({ path, projectedBarrelExport }),
    );

    return {
      classification: "needsMergeStrategy" as const,
      conflicts,
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
    conflicts: [] as Array<PlanConflict>,
  };
};
const parseSimpleBarrelExports = (contents: string) => {
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
const simpleBarrelExportPattern = /^export \* from "(\.[^"]*)";$/;
const createTsconfigPlanConflict = ({
  path,
}: {
  path: string;
}): PlanConflict => ({
  _tag: "tsconfig",
  path,
});
const createBarrelExportPlanConflict = ({
  path,
  projectedBarrelExport,
}: {
  path: string;
  projectedBarrelExport: ProjectedBarrelExport;
}): PlanConflict => ({
  _tag: "barrelExport",
  path,
  exportPath: projectedBarrelExport.exportPath,
});
const createPackageJsonExportPlanConflict = ({
  path,
  projectedExport,
}: {
  path: string;
  projectedExport: ProjectedPackageJsonExport;
}): Extract<PlanConflict, { _tag: "packageJsonExports" }> => ({
  _tag: "packageJsonExports",
  path,
  exportKey: projectedExport.exportKey,
});
const createPackageJsonScriptPlanConflict = ({
  path,
  projectedScript,
}: {
  path: string;
  projectedScript: ProjectedPackageJsonScript;
}): Extract<PlanConflict, { _tag: "packageJsonScripts" }> => ({
  _tag: "packageJsonScripts",
  path,
  scriptName: projectedScript.scriptName,
});
const createPackageJsonDependencyPlanConflict = ({
  path,
  projectedDependency,
}: {
  path: string;
  projectedDependency: ProjectedPackageJsonDependency;
}): Extract<PlanConflict, { _tag: "packageJsonDependencies" }> => ({
  _tag: "packageJsonDependencies",
  path,
  section: projectedDependency.section,
  dependencyName: projectedDependency.dependencyName,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFlatStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) &&
  Arr.every(Record.values(value), (entry) => typeof entry === "string");

const parseJsonRecord = (
  contents: string,
): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(contents) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const getExistingFileContents = ({
  path,
  snapshotPath,
}: {
  path: string;
  snapshotPath: RepoSnapshotPath | undefined;
}): string | undefined => {
  if (snapshotPath === undefined || snapshotPath._tag === "missing") {
    return undefined;
  }

  if (snapshotPath._tag !== "file") {
    throw new PlanFailure({
      reason: "repoRootNotEmpty",
      message: `Expected ${path} to be a file during planning.`,
    });
  }

  return snapshotPath.contents;
};

const collectDirectoryPaths = (paths: ReadonlyArray<string>) => {
  const directories = new Set<string>();

  for (const path of paths) {
    const parts = path.split("/");

    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }

  return Arr.sort(directories, pathOrd);
};

type ProjectedPlanPath = {
  readonly path: string;
};

type ProjectedPackageJsonExport = {
  readonly exportKey: string;
  readonly exportValue: string;
};

type ProjectedPackageJsonDependency = {
  readonly section: "dependencies" | "devDependencies";
  readonly dependencyName: string;
  readonly dependencyValue: string;
};

type ProjectedPackageJsonScript = {
  readonly scriptName: string;
  readonly scriptValue: string;
};

type ProjectedBarrelExport = {
  readonly exportPath: string;
};

type ProjectedTsconfig = {
  readonly path: string;
  readonly contents: string;
};

type PlanChangesetPath = {
  readonly path: string;
  readonly authoritativeContents: string | undefined;
  readonly packageJsonExports: ReadonlyArray<ProjectedPackageJsonExport>;
  readonly packageJsonDependencies: ReadonlyArray<ProjectedPackageJsonDependency>;
  readonly packageJsonScripts: ReadonlyArray<ProjectedPackageJsonScript>;
  readonly barrelExports: ReadonlyArray<ProjectedBarrelExport>;
  readonly tsconfig: ProjectedTsconfig | undefined;
};

type PlanChangeset = {
  readonly paths: ReadonlyArray<PlanChangesetPath>;
};

type PlanChangesetOperationFamily =
  | "authoritative"
  | "packageJson"
  | "barrel"
  | "tsconfig";

type PackageJsonPlanConflict = Extract<
  PlanConflict,
  | { _tag: "packageJsonExports" }
  | { _tag: "packageJsonDependencies" }
  | { _tag: "packageJsonScripts" }
>;

type MutablePlanChangesetPath = {
  readonly path: string;
  family?: PlanChangesetOperationFamily;
  authoritativeContents?: string;
  readonly packageJsonExports: Array<ProjectedPackageJsonExport>;
  readonly packageJsonDependencies: Array<ProjectedPackageJsonDependency>;
  readonly packageJsonScripts: Array<ProjectedPackageJsonScript>;
  readonly barrelExports: Array<ProjectedBarrelExport>;
  tsconfig?: ProjectedTsconfig;
};

const flattenContributions = (
  normalizedContributions: NormalizedContributions,
) => [
  ...normalizedContributions.targets.map((entry) => entry.contributions),
  ...normalizedContributions.modules.map((entry) => entry.contributions),
];

const collectProjectedPlanPaths = (
  normalizedContributions: NormalizedContributions,
) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();

  for (const contributions of flattenContributions(normalizedContributions)) {
    for (const file of contributions.files) {
      projectedPaths.set(file.path, { path: file.path });
    }

    for (const entry of contributions.packageJsonExports) {
      projectedPaths.set(entry.packageJsonPath, {
        path: entry.packageJsonPath,
      });
    }

    for (const entry of contributions.packageJsonDependencies) {
      projectedPaths.set(entry.packageJsonPath, {
        path: entry.packageJsonPath,
      });
    }

    for (const entry of contributions.packageJsonScripts) {
      projectedPaths.set(entry.packageJsonPath, {
        path: entry.packageJsonPath,
      });
    }

    for (const entry of contributions.barrelExports) {
      projectedPaths.set(entry.barrelPath, { path: entry.barrelPath });
    }

    for (const entry of contributions.tsconfigs) {
      projectedPaths.set(entry.path, { path: entry.path });
    }
  }

  return Arr.sort(projectedPaths.values(), planPathOrd);
};

const collectProjectedContents = (
  normalizedContributions: NormalizedContributions,
) => {
  const projectedContents = new Map<string, string>();

  for (const contributions of flattenContributions(normalizedContributions)) {
    for (const file of contributions.files) {
      projectedContents.set(file.path, file.contents);
    }
  }

  return projectedContents;
};

const collectProjectedPackageJsonExports = (
  normalizedContributions: NormalizedContributions,
) => {
  const projectedExportsByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonExport>
  >();

  for (const contributions of flattenContributions(normalizedContributions)) {
    for (const entry of contributions.packageJsonExports) {
      const pathExports =
        projectedExportsByPath.get(entry.packageJsonPath) ??
        new Map<string, ProjectedPackageJsonExport>();

      pathExports.set(entry.exportKey, {
        exportKey: entry.exportKey,
        exportValue: entry.exportValue,
      });
      projectedExportsByPath.set(entry.packageJsonPath, pathExports);
    }
  }

  return new Map(
    Arr.fromIterable(projectedExportsByPath.entries()).map(
      ([path, projectedExports]) => [
        path,
        Arr.sort(projectedExports.values(), projectedPackageJsonExportOrd),
      ],
    ),
  );
};

const collectProjectedPackageJsonDependencies = (
  normalizedContributions: NormalizedContributions,
) => {
  const projectedDependenciesByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonDependency>
  >();

  for (const contributions of flattenContributions(normalizedContributions)) {
    for (const entry of contributions.packageJsonDependencies) {
      const pathDependencies =
        projectedDependenciesByPath.get(entry.packageJsonPath) ??
        new Map<string, ProjectedPackageJsonDependency>();

      pathDependencies.set(`${entry.section}:${entry.dependencyName}`, {
        section: entry.section,
        dependencyName: entry.dependencyName,
        dependencyValue: entry.dependencyValue,
      });
      projectedDependenciesByPath.set(entry.packageJsonPath, pathDependencies);
    }
  }

  return new Map(
    Arr.fromIterable(projectedDependenciesByPath.entries()).map(
      ([path, projectedDependencies]) => [
        path,
        Arr.sort(
          projectedDependencies.values(),
          projectedPackageJsonDependencyOrd,
        ),
      ],
    ),
  );
};

const collectProjectedPackageJsonScripts = (
  normalizedContributions: NormalizedContributions,
) => {
  const projectedScriptsByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonScript>
  >();

  for (const contributions of flattenContributions(normalizedContributions)) {
    for (const entry of contributions.packageJsonScripts) {
      const pathScripts =
        projectedScriptsByPath.get(entry.packageJsonPath) ??
        new Map<string, ProjectedPackageJsonScript>();

      pathScripts.set(entry.scriptName, {
        scriptName: entry.scriptName,
        scriptValue: entry.scriptValue,
      });
      projectedScriptsByPath.set(entry.packageJsonPath, pathScripts);
    }
  }

  return new Map(
    Arr.fromIterable(projectedScriptsByPath.entries()).map(
      ([path, projectedScripts]) => [
        path,
        Arr.sort(projectedScripts.values(), projectedPackageJsonScriptOrd),
      ],
    ),
  );
};

const collectProjectedBarrelExports = (
  normalizedContributions: NormalizedContributions,
) => {
  const projectedBarrelExportsByPath = new Map<
    string,
    Map<string, ProjectedBarrelExport>
  >();

  for (const contributions of flattenContributions(normalizedContributions)) {
    for (const entry of contributions.barrelExports) {
      const pathBarrelExports =
        projectedBarrelExportsByPath.get(entry.barrelPath) ??
        new Map<string, ProjectedBarrelExport>();

      pathBarrelExports.set(entry.exportPath, {
        exportPath: entry.exportPath,
      });
      projectedBarrelExportsByPath.set(entry.barrelPath, pathBarrelExports);
    }
  }

  return new Map(
    Arr.fromIterable(projectedBarrelExportsByPath.entries()).map(
      ([path, projectedBarrelExports]) => [
        path,
        Arr.sort(projectedBarrelExports.values(), projectedBarrelExportOrd),
      ],
    ),
  );
};

const collectProjectedTsconfigs = (
  normalizedContributions: NormalizedContributions,
) => {
  const projectedTsconfigs = new Map<string, ProjectedTsconfig>();

  for (const contributions of flattenContributions(normalizedContributions)) {
    for (const entry of contributions.tsconfigs) {
      projectedTsconfigs.set(entry.path, {
        path: entry.path,
        contents: entry.contents,
      });
    }
  }

  return projectedTsconfigs;
};

const getOrCreatePlanChangesetPath = (
  changesetPaths: Map<string, MutablePlanChangesetPath>,
  path: string,
) => {
  const current = changesetPaths.get(path);

  if (current !== undefined) {
    return current;
  }

  const next: MutablePlanChangesetPath = {
    path,
    packageJsonExports: [],
    packageJsonDependencies: [],
    packageJsonScripts: [],
    barrelExports: [],
  };

  changesetPaths.set(path, next);
  return next;
};

const nameFromPath = (path: string) => {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
};

const parentPathFromPath = (path: string) => {
  const lastSeparatorIndex = path.lastIndexOf("/");

  if (lastSeparatorIndex === -1) {
    return ".";
  }

  return path.slice(0, lastSeparatorIndex);
};
