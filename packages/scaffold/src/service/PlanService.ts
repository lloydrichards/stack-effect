import type { Blueprint, ResolvedTarget } from "@repo/domain/Blueprint";
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
import { Array as Arr, Context, Effect, Layer, Option, Record } from "effect";
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
import {
  byBarrelExportPathOrd,
  byDependencySectionAndNameOrd,
  byExportKeyOrd,
  byPathOrd,
  byScriptNameOrd,
} from "./planOrders";
import { RepoSnapshotService } from "./RepoSnapshotService";

const planChangesetPathOrd = byPathOrd<
  PlanChangesetPath | MutablePlanChangesetPath
>();

const projectedPlanPathOrd = byPathOrd<ProjectedPlanPath>();

const projectedPackageJsonExportOrd =
  byExportKeyOrd<ProjectedPackageJsonExport>();

const projectedPackageJsonDependencyOrd =
  byDependencySectionAndNameOrd<ProjectedPackageJsonDependency>();

const projectedPackageJsonScriptOrd =
  byScriptNameOrd<ProjectedPackageJsonScript>();

const projectedBarrelExportOrd = byBarrelExportPathOrd<ProjectedBarrelExport>();

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

      return projectPlan({ changeset, repoSnapshot });
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
    paths: Arr.sort(changesetPaths.values(), planChangesetPathOrd).map(
      (pathEntry) => ({
        path: pathEntry.path,
        authoritativeContents: pathEntry.authoritativeContents,
        packageJsonExports: Arr.fromIterable(pathEntry.packageJsonExports),
        packageJsonDependencies: Arr.fromIterable(
          pathEntry.packageJsonDependencies,
        ),
        packageJsonScripts: Arr.fromIterable(pathEntry.packageJsonScripts),
        barrelExports: Arr.fromIterable(pathEntry.barrelExports),
        tsconfig: pathEntry.tsconfig,
      }),
    ),
  };
};
const collectPlanInspectionPaths = (changeset: PlanChangeset) => {
  const requestedPaths = new Set<string>();

  for (const changesetPath of changeset.paths) {
    requestedPaths.add(changesetPath.path);

    for (const directoryPath of collectDirectoryPaths([changesetPath.path])) {
      requestedPaths.add(directoryPath);
    }
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
    ...directoryPaths.map((path) => ({ _tag: "directory" as const, path })),
    ...changeset.paths.map((changesetPath) => ({
      _tag: "file" as const,
      path: changesetPath.path,
      classification: fileClassifications.get(changesetPath.path) ?? "create",
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
    const parentPath = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : ".";
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
    const parentPath = changesetPath.path.includes("/")
      ? changesetPath.path.slice(0, changesetPath.path.lastIndexOf("/"))
      : ".";

    directories.get(parentPath)?.children.push({
      _tag: "file",
      name: nameFromPath(changesetPath.path),
      path: changesetPath.path,
      classification: Arr.findFirst(
        entries,
        (
          planEntry,
        ): planEntry is Extract<(typeof entries)[number], { _tag: "file" }> =>
          planEntry._tag === "file" && planEntry.path === changesetPath.path,
      ).pipe(
        Option.map((entry) => entry.classification),
        Option.getOrElse((): PlanEntryClassification => "create"),
      ),
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
  if (snapshotPath === undefined || snapshotPath._tag === "missing") {
    return {
      classification: "create" as const,
      conflicts: [] as Array<PlanConflict>,
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
  if (snapshotPath === undefined || snapshotPath._tag === "missing") {
    return {
      classification: "create" as const,
      conflicts: [] as Array<PlanConflict>,
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
    const conflicts: Array<PackageJsonPlanConflict> = [
      ...projectedExports.map((projectedExport) =>
        createPackageJsonExportPlanConflict({ path, projectedExport }),
      ),
      ...projectedDependencies.map((projectedDependency) =>
        createPackageJsonDependencyPlanConflict({
          path,
          projectedDependency,
        }),
      ),
      ...projectedScripts.map((projectedScript) =>
        createPackageJsonScriptPlanConflict({
          path,
          projectedScript,
        }),
      ),
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
    conflicts.push(
      ...projectedExports.map((projectedExport) =>
        createPackageJsonExportPlanConflict({ path, projectedExport }),
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
    conflicts.push(
      ...projectedScripts.map((projectedScript) =>
        createPackageJsonScriptPlanConflict({
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
  if (snapshotPath === undefined || snapshotPath._tag === "missing") {
    return {
      classification: "create" as const,
      conflicts: [] as Array<PlanConflict>,
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

const appendProjectedPath = (
  projectedPaths: Map<string, ProjectedPlanPath>,
  path: string,
) => {
  projectedPaths.set(path, { path });
};

const appendProjectedPackageJsonExport = (
  projectedExports: Map<string, ProjectedPackageJsonExport>,
  exportKey: string,
  exportValue: string,
) => {
  projectedExports.set(exportKey, {
    exportKey,
    exportValue,
  });
};

const appendProjectedPackageJsonDependency = (
  projectedDependencies: Map<string, ProjectedPackageJsonDependency>,
  dependency: ProjectedPackageJsonDependency,
) => {
  const key = `${dependency.section}:${dependency.dependencyName}`;

  projectedDependencies.set(key, {
    section: dependency.section,
    dependencyName: dependency.dependencyName,
    dependencyValue: dependency.dependencyValue,
  });
};

const appendProjectedPackageJsonScript = (
  projectedScripts: Map<string, ProjectedPackageJsonScript>,
  script: ProjectedPackageJsonScript,
) => {
  projectedScripts.set(script.scriptName, {
    scriptName: script.scriptName,
    scriptValue: script.scriptValue,
  });
};

const appendProjectedBarrelExport = (
  projectedBarrelExports: Map<string, ProjectedBarrelExport>,
  exportPath: string,
) => {
  projectedBarrelExports.set(exportPath, {
    exportPath,
  });
};

const appendProjectedTsconfig = (
  projectedTsconfigs: Map<string, ProjectedTsconfig>,
  projectedTsconfig: ProjectedTsconfig,
) => {
  projectedTsconfigs.set(projectedTsconfig.path, {
    path: projectedTsconfig.path,
    contents: projectedTsconfig.contents,
  });
};

const isServerTarget = (target: ResolvedTarget) =>
  target.id === "apps/server-api";

const isDomainPackageTarget = (target: ResolvedTarget) =>
  target.id === "packages/domain";

const hasRepoOnlyRootBootstrap = (blueprint: Blueprint) => {
  if (blueprint.nodes.length > 0) {
    return undefined;
  }

  const rootBootstrap = blueprint.modules.find(
    (repoModule) => repoModule.moduleId === "root-bootstrap",
  );

  return rootBootstrap === undefined ? undefined : true;
};

const collectProjectedRootBootstrapPaths = (blueprint: Blueprint) => {
  const hasRootBootstrap = hasRepoOnlyRootBootstrap(blueprint);

  if (hasRootBootstrap === undefined) {
    return [];
  }

  return Object.keys(rootBootstrapFiles)
    .sort(pathOrd)
    .map((path) => ({ path })) satisfies Array<ProjectedPlanPath>;
};

const projectServerTargetPaths = (target: ResolvedTarget) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();

  appendProjectedPath(projectedPaths, "apps/server/package.json");
  appendProjectedPath(projectedPaths, "apps/server/tsconfig.json");
  appendProjectedPath(projectedPaths, "apps/server/src/index.ts");

  for (const targetModule of target.targetModules) {
    if (targetModule.moduleId !== "http-api-server") {
      continue;
    }

    appendProjectedPath(projectedPaths, "apps/server/src/index.ts");
    appendProjectedPath(projectedPaths, "apps/server/src/Api/Health.ts");
    appendProjectedPath(projectedPaths, "apps/server/src/Api/Hello.ts");
  }

  return Arr.sort(projectedPaths.values(), projectedPlanPathOrd);
};

const projectDomainPackageTargetPaths = (target: ResolvedTarget) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();

  appendProjectedPath(projectedPaths, "packages/domain/package.json");
  appendProjectedPath(projectedPaths, "packages/domain/tsconfig.json");

  if (
    target.composition?._tag === "package" &&
    target.composition.publicEntrypoint === "./Api"
  ) {
    appendProjectedPath(projectedPaths, "packages/domain/package.json");
    appendProjectedPath(projectedPaths, "packages/domain/src/index.ts");
  }

  for (const targetModule of target.targetModules) {
    if (targetModule.moduleId !== "domain-api") {
      continue;
    }

    appendProjectedPath(projectedPaths, "packages/domain/src/Api.ts");
  }

  return Arr.sort(projectedPaths.values(), projectedPlanPathOrd);
};

const collectProjectedPlanPaths = (blueprint: Blueprint) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();

  for (const projectedPath of collectProjectedRootBootstrapPaths(blueprint)) {
    appendProjectedPath(projectedPaths, projectedPath.path);
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
      appendProjectedPath(projectedPaths, projectedPath.path);
    }
  }

  return Arr.sort(projectedPaths.values(), projectedPlanPathOrd);
};

const collectProjectedContents = (blueprint: Blueprint) => {
  const projectedContents = new Map<string, string>(
    Object.entries(rootBootstrapFiles)
      .filter(() => hasRepoOnlyRootBootstrap(blueprint) !== undefined)
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

const collectProjectedPackageJsonExports = (blueprint: Blueprint) => {
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

    appendProjectedPackageJsonExport(pathExports, "./Api", "./src/Api.ts");
    projectedExportsByPath.set(path, pathExports);
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

const collectProjectedPackageJsonDependencies = (blueprint: Blueprint) => {
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

    appendProjectedPackageJsonDependency(pathDependencies, {
      section: "dependencies",
      dependencyName: "effect",
      dependencyValue: "4.0.0-beta.47",
    });
    appendProjectedPackageJsonDependency(pathDependencies, {
      section: "devDependencies",
      dependencyName: "@repo/config-typescript",
      dependencyValue: "workspace:*",
    });
    projectedDependenciesByPath.set(path, pathDependencies);
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

const collectProjectedPackageJsonScripts = (blueprint: Blueprint) => {
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

      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "build",
        scriptValue:
          "bun build src/index.ts --outdir=dist --target=bun --minify",
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "build:types",
        scriptValue: "tsc --emitDeclarationOnly",
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "dev",
        scriptValue: "bun --watch run src/index.ts",
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "test",
        scriptValue: "vitest run",
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "type-check",
        scriptValue: "tsc --noEmit",
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "clean",
        scriptValue: "git clean -xdf .cache .turbo dist node_modules",
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

    appendProjectedPackageJsonScript(pathScripts, {
      scriptName: "type-check",
      scriptValue: "tsc --noEmit",
    });
    appendProjectedPackageJsonScript(pathScripts, {
      scriptName: "clean",
      scriptValue:
        "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
    });
    projectedScriptsByPath.set(path, pathScripts);
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

const collectProjectedBarrelExports = (blueprint: Blueprint) => {
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

    appendProjectedBarrelExport(pathBarrelExports, "./Api");
    projectedBarrelExportsByPath.set(path, pathBarrelExports);
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

const collectProjectedTsconfigs = (blueprint: Blueprint) => {
  const projectedTsconfigs = new Map<string, ProjectedTsconfig>();

  for (const target of blueprint.nodes) {
    if (isServerTarget(target)) {
      appendProjectedTsconfig(projectedTsconfigs, {
        path: "apps/server/tsconfig.json",
        contents: serverTsconfigContents,
      });
      continue;
    }

    if (isDomainPackageTarget(target)) {
      appendProjectedTsconfig(projectedTsconfigs, {
        path: "packages/domain/tsconfig.json",
        contents: packageDomainTsconfigContents,
      });
    }
  }

  return new Map(projectedTsconfigs.entries());
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
