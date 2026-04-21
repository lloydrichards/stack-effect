import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Blueprint as DomainBlueprint } from "@repo/domain/Blueprint";
import {
  MergeRequirement as DomainMergeRequirement,
  Plan as DomainPlan,
  PlanCause as DomainPlanCause,
  PlanDirectoryEntry as DomainPlanDirectoryEntry,
  PlanEntry as DomainPlanEntry,
  PlanEntryClassification as DomainPlanEntryClassification,
  PlanFileEntry as DomainPlanFileEntry,
  PlanTreeDirectoryNode as DomainPlanTreeDirectoryNode,
  PlanTreeFileNode as DomainPlanTreeFileNode,
  PlanTreeNode as DomainPlanTreeNode,
  PlanWarning as DomainPlanWarning,
} from "@repo/domain/Plan";
import { Effect, Schema } from "effect";

export const PlanEntryClassification = DomainPlanEntryClassification;
export type PlanEntryClassification = Schema.Schema.Type<
  typeof PlanEntryClassification
>;

export const PlanCause = DomainPlanCause;
export type PlanCause = Schema.Schema.Type<typeof PlanCause>;

export const MergeRequirement = DomainMergeRequirement;
export type MergeRequirement = Schema.Schema.Type<typeof MergeRequirement>;

export const PlanWarning = DomainPlanWarning;
export type PlanWarning = Schema.Schema.Type<typeof PlanWarning>;

export const PlanFileEntry = DomainPlanFileEntry;
export type PlanFileEntry = Schema.Schema.Type<typeof PlanFileEntry>;

export const PlanDirectoryEntry = DomainPlanDirectoryEntry;
export type PlanDirectoryEntry = Schema.Schema.Type<typeof PlanDirectoryEntry>;

export const PlanEntry = DomainPlanEntry;
export type PlanEntry = Schema.Schema.Type<typeof PlanEntry>;

export const PlanTreeFileNode = DomainPlanTreeFileNode;
export type PlanTreeFileNode = Schema.Schema.Type<typeof PlanTreeFileNode>;

export const PlanTreeDirectoryNode = DomainPlanTreeDirectoryNode;
export type PlanTreeDirectoryNode = Schema.Schema.Type<
  typeof PlanTreeDirectoryNode
>;

export const PlanTreeNode = DomainPlanTreeNode;
export type PlanTreeNode = Schema.Schema.Type<typeof PlanTreeNode>;
export type PlanTreeNodeSchema = Schema.Schema.Type<typeof PlanTreeNode>;

export const Plan = DomainPlan;
export type Plan = Schema.Schema.Type<typeof Plan>;

export const BlueprintStatus = Schema.Literals(["selected", "implied"]);
export type BlueprintStatus = Schema.Schema.Type<typeof BlueprintStatus>;

export const BlueprintRepoModule = Schema.Struct({
  moduleId: Schema.String,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(PlanCause),
});
export type BlueprintRepoModule = Schema.Schema.Type<
  typeof BlueprintRepoModule
>;

export const BlueprintTargetModule = Schema.Struct({
  moduleId: Schema.String,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(PlanCause),
});
export type BlueprintTargetModule = Schema.Schema.Type<
  typeof BlueprintTargetModule
>;

export const BlueprintTargetComposition = Schema.Struct({
  slot: Schema.String,
  value: Schema.String,
  causes: Schema.NonEmptyArray(PlanCause),
});
export type BlueprintTargetComposition = Schema.Schema.Type<
  typeof BlueprintTargetComposition
>;

export const BlueprintTarget = Schema.Struct({
  targetId: Schema.String,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(PlanCause),
  targetModules: Schema.Array(BlueprintTargetModule),
  compositions: Schema.Array(BlueprintTargetComposition),
});
export type BlueprintTarget = Schema.Schema.Type<typeof BlueprintTarget>;

export const BlueprintIntent = Schema.TaggedStruct("sourceFile", {
  path: Schema.String,
  contents: Schema.String,
  causes: Schema.NonEmptyArray(PlanCause),
});
export type BlueprintIntent = Schema.Schema.Type<typeof BlueprintIntent>;

export const Blueprint = Schema.Struct({
  repoModules: Schema.Array(BlueprintRepoModule),
  targets: Schema.Array(BlueprintTarget),
  intents: Schema.Array(BlueprintIntent),
});
export type Blueprint = Schema.Schema.Type<typeof Blueprint>;

export const RepoSnapshotPath = Schema.Union([
  Schema.TaggedStruct("missing", {
    path: Schema.String,
  }),
  Schema.TaggedStruct("directory", {
    path: Schema.String,
  }),
  Schema.TaggedStruct("file", {
    path: Schema.String,
    contents: Schema.String,
  }),
]);
export type RepoSnapshotPath = Schema.Schema.Type<typeof RepoSnapshotPath>;

export const RepoSnapshot = Schema.Struct({
  rootEntries: Schema.Array(Schema.String),
  paths: Schema.Array(RepoSnapshotPath),
});
export type RepoSnapshot = Schema.Schema.Type<typeof RepoSnapshot>;

export class PlanBuildError extends Error {
  readonly _tag = "PlanBuildError";

  constructor(
    readonly details: {
      reason: "repoRootNotEmpty";
      message: string;
    },
  ) {
    super(details.message);
    this.name = "PlanBuildError";
  }

  get reason() {
    return this.details.reason;
  }
}

const decodeBlueprint = Schema.decodeUnknownSync(Blueprint);
const decodeDomainBlueprint = Schema.decodeUnknownSync(DomainBlueprint);

const toPrototypeTargetId = (targetId: string): string => {
  if (targetId === "packages/domain") {
    return "package/domain";
  }

  if (targetId === "apps/server-api") {
    return "app/server";
  }

  return targetId;
};

const toPrototypeTargetCause = (
  targetId: string,
  cause: typeof DomainBlueprint.Type.nodes[number]["causes"][number],
): PlanCause => {
  switch (cause._tag) {
    case "selection":
      return {
        _tag: "selectedTarget",
        targetId,
      };
    case "dependency":
      return {
        _tag: "impliedTarget",
        targetId,
        via: cause.edgeId,
      };
  }
};

const toPrototypeTargetModuleCause = ({
  targetId,
  moduleId,
  cause,
}: {
  targetId: string;
  moduleId: string;
  cause: typeof DomainBlueprint.Type.nodes[number]["targetModules"][number]["causes"][number];
}): PlanCause => ({
  _tag: "impliedTargetModule",
  targetId,
  moduleId,
  via: cause._tag === "dependency" ? cause.edgeId : `${targetId}:${moduleId}`,
});

const toPrototypeRepoModuleCause = (
  moduleId: string,
): PlanCause => ({
  _tag: "selectedRepoModule",
  moduleId,
});

const normalizeBlueprint = (blueprint: unknown): typeof Blueprint.Type => {
  if (
    typeof blueprint === "object" &&
    blueprint !== null &&
    "repoModules" in blueprint &&
    "targets" in blueprint
  ) {
    return decodeBlueprint(blueprint);
  }

  const domainBlueprint = decodeDomainBlueprint(blueprint);

  return decodeBlueprint({
    repoModules: domainBlueprint.modules.map((module) => ({
      moduleId: module.moduleId,
      status: module.status,
      causes: module.causes.map(() => toPrototypeRepoModuleCause(module.moduleId)),
    })),
    targets: domainBlueprint.nodes.map((target) => {
      const targetId = toPrototypeTargetId(target.id);
      const compositionCauses =
        target.targetModules[0] !== undefined
          ? target.targetModules[0].causes.map((cause) =>
              toPrototypeTargetModuleCause({
                targetId,
                moduleId: target.targetModules[0]?.moduleId ?? "",
                cause,
              }),
            )
          : target.causes.map((cause) => toPrototypeTargetCause(targetId, cause));

      return {
        targetId,
        status: target.status,
        causes: target.causes.map((cause) => toPrototypeTargetCause(targetId, cause)),
        targetModules: target.targetModules.map((targetModule) => ({
          moduleId: targetModule.moduleId,
          status: targetModule.status,
          causes: targetModule.causes.map((cause) =>
            toPrototypeTargetModuleCause({
              targetId,
              moduleId: targetModule.moduleId,
              cause,
            }),
          ),
        })),
        compositions:
          target.composition?._tag === "package"
            ? [
                {
                  slot: "public-entrypoint",
                  value: target.composition.publicEntrypoint,
                  causes: compositionCauses,
                },
              ]
            : [],
      };
    }),
    intents: [],
  });
};

const sortPaths = (left: string, right: string) => {
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

const sortCauses = (causes: ReadonlyArray<PlanCause>) =>
  [...causes].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  ) as [PlanCause, ...Array<PlanCause>];

const mergeCauses = (
  first: ReadonlyArray<PlanCause>,
  second: ReadonlyArray<PlanCause>,
) => {
  const merged = new Map<string, PlanCause>();

  for (const cause of [...first, ...second]) {
    merged.set(JSON.stringify(cause), cause);
  }

  return sortCauses([...merged.values()]);
};

const collectDirectoryPaths = (paths: ReadonlyArray<string>) => {
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

type ProjectedPackageJsonExport = {
  readonly exportKey: string;
  readonly exportValue: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

type ProjectedPackageJsonDependency = {
  readonly section: "dependencies" | "devDependencies";
  readonly dependencyName: string;
  readonly dependencyValue: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

type ProjectedPackageJsonScript = {
  readonly scriptName: string;
  readonly scriptValue: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

type ProjectedBarrelExport = {
  readonly exportPath: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

type ProjectedTsconfig = {
  readonly path: string;
  readonly contents: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

const appendProjectedPath = (
  projectedPaths: Map<string, ProjectedPlanPath>,
  path: string,
  causes: ReadonlyArray<PlanCause>,
) => {
  const current = projectedPaths.get(path);

  projectedPaths.set(path, {
    path,
    causes: current ? mergeCauses(current.causes, causes) : sortCauses(causes),
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
    causes: current ? mergeCauses(current.causes, causes) : sortCauses(causes),
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
      ? mergeCauses(current.causes, dependency.causes)
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
      ? mergeCauses(current.causes, script.causes)
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
    causes: current ? mergeCauses(current.causes, causes) : sortCauses(causes),
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
      ? mergeCauses(current.causes, projectedTsconfig.causes)
      : sortCauses(projectedTsconfig.causes),
  });
};

const packageDomainTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["dist", "build", "node_modules"]
}
`;

const serverTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "dist",
    "noEmit": true,
    "types": ["@types/bun"]
  },
  "include": ["src/**/*", "../../packages/ai/src/LanguageModel.ts"],
  "exclude": ["node_modules", "dist"]
}
`;

const rootBootstrapFiles = {
  ".gitignore": "node_modules\n",
  "package.json": '{"private":true}',
  "packages/config-typescript/base.json": '{"compilerOptions":{}}',
  "turbo.json": '{"$schema":"https://turbo.build/schema.json"}',
} as const;

const getRepoOnlyRootBootstrapCauses = (blueprint: Blueprint) => {
  if (blueprint.targets.length > 0 || blueprint.intents.length > 0) {
    return undefined;
  }

  return blueprint.repoModules.find(
    (repoModule) => repoModule.moduleId === "root-bootstrap",
  )?.causes;
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

const projectServerTargetPaths = (target: BlueprintTarget) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();

  appendProjectedPath(
    projectedPaths,
    "apps/server/package.json",
    target.causes,
  );
  appendProjectedPath(
    projectedPaths,
    "apps/server/tsconfig.json",
    target.causes,
  );
  appendProjectedPath(
    projectedPaths,
    "apps/server/src/index.ts",
    target.causes,
  );

  for (const targetModule of target.targetModules) {
    if (targetModule.moduleId !== "http-api-server") {
      continue;
    }

    appendProjectedPath(
      projectedPaths,
      "apps/server/src/index.ts",
      targetModule.causes,
    );
    appendProjectedPath(
      projectedPaths,
      "apps/server/src/Api/Health.ts",
      targetModule.causes,
    );
    appendProjectedPath(
      projectedPaths,
      "apps/server/src/Api/Hello.ts",
      targetModule.causes,
    );
  }

  return [...projectedPaths.values()].sort((left, right) =>
    sortPaths(left.path, right.path),
  );
};

const projectDomainPackageTargetPaths = (target: BlueprintTarget) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();

  appendProjectedPath(
    projectedPaths,
    "packages/domain/package.json",
    target.causes,
  );
  appendProjectedPath(
    projectedPaths,
    "packages/domain/tsconfig.json",
    target.causes,
  );

  for (const composition of target.compositions) {
    if (
      composition.slot !== "public-entrypoint" ||
      composition.value !== "./Api"
    ) {
      continue;
    }

    appendProjectedPath(
      projectedPaths,
      "packages/domain/package.json",
      composition.causes,
    );
    appendProjectedPath(
      projectedPaths,
      "packages/domain/src/index.ts",
      composition.causes,
    );
  }

  for (const targetModule of target.targetModules) {
    if (targetModule.moduleId !== "domain-api") {
      continue;
    }

    appendProjectedPath(
      projectedPaths,
      "packages/domain/src/Api.ts",
      targetModule.causes,
    );
  }

  return [...projectedPaths.values()].sort((left, right) =>
    sortPaths(left.path, right.path),
  );
};

const collectProjectedPlanPaths = (blueprint: Blueprint) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();

  for (const projectedPath of collectProjectedRootBootstrapPaths(blueprint)) {
    appendProjectedPath(projectedPaths, projectedPath.path, projectedPath.causes);
  }

  for (const intent of blueprint.intents) {
    appendProjectedPath(projectedPaths, intent.path, intent.causes);
  }

  for (const target of blueprint.targets) {
    const targetProjectedPaths = (() => {
      if (target.targetId === "app/server") {
        return projectServerTargetPaths(target);
      }

      if (target.targetId === "package/domain") {
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

const collectBlueprintIntentContents = (blueprint: Blueprint) =>
  new Map(
    [
      ...Object.entries(rootBootstrapFiles)
        .filter(() => getRepoOnlyRootBootstrapCauses(blueprint) !== undefined)
        .map(([path, contents]) => [path, contents] as const),
      ...blueprint.intents.map((intent) => [intent.path, intent.contents] as const),
    ],
  );

const collectProjectedPackageJsonExports = (blueprint: Blueprint) => {
  const projectedExportsByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonExport>
  >();

  for (const target of blueprint.targets) {
    if (target.targetId !== "package/domain") {
      continue;
    }

    for (const composition of target.compositions) {
      if (
        composition.slot !== "public-entrypoint" ||
        composition.value !== "./Api"
      ) {
        continue;
      }

      const path = "packages/domain/package.json";
      const pathExports =
        projectedExportsByPath.get(path) ??
        new Map<string, ProjectedPackageJsonExport>();

      appendProjectedPackageJsonExport(
        pathExports,
        "./Api",
        "./src/Api.ts",
        composition.causes,
      );
      projectedExportsByPath.set(path, pathExports);
    }
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

const collectProjectedPackageJsonDependencies = (blueprint: Blueprint) => {
  const projectedDependenciesByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonDependency>
  >();

  for (const target of blueprint.targets) {
    if (target.targetId !== "package/domain") {
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
      causes: target.causes,
    });
    appendProjectedPackageJsonDependency(pathDependencies, {
      section: "devDependencies",
      dependencyName: "@repo/config-typescript",
      dependencyValue: "workspace:*",
      causes: target.causes,
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

const collectProjectedPackageJsonScripts = (blueprint: Blueprint) => {
  const projectedScriptsByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonScript>
  >();

  for (const target of blueprint.targets) {
    if (target.targetId === "app/server") {
      const path = "apps/server/package.json";
      const pathScripts =
        projectedScriptsByPath.get(path) ??
        new Map<string, ProjectedPackageJsonScript>();

      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "build",
        scriptValue:
          "bun build src/index.ts --outdir=dist --target=bun --minify",
        causes: target.causes,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "build:types",
        scriptValue: "tsc --emitDeclarationOnly",
        causes: target.causes,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "dev",
        scriptValue: "bun --watch run src/index.ts",
        causes: target.causes,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "test",
        scriptValue: "vitest run",
        causes: target.causes,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "type-check",
        scriptValue: "tsc --noEmit",
        causes: target.causes,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "clean",
        scriptValue: "git clean -xdf .cache .turbo dist node_modules",
        causes: target.causes,
      });
      projectedScriptsByPath.set(path, pathScripts);
      continue;
    }

    if (target.targetId !== "package/domain") {
      continue;
    }

    const path = "packages/domain/package.json";
    const pathScripts =
      projectedScriptsByPath.get(path) ??
      new Map<string, ProjectedPackageJsonScript>();

    appendProjectedPackageJsonScript(pathScripts, {
      scriptName: "type-check",
      scriptValue: "tsc --noEmit",
      causes: target.causes,
    });
    appendProjectedPackageJsonScript(pathScripts, {
      scriptName: "clean",
      scriptValue:
        "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
      causes: target.causes,
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

const collectProjectedBarrelExports = (blueprint: Blueprint) => {
  const projectedBarrelExportsByPath = new Map<
    string,
    Map<string, ProjectedBarrelExport>
  >();

  for (const target of blueprint.targets) {
    if (target.targetId !== "package/domain") {
      continue;
    }

    for (const composition of target.compositions) {
      if (
        composition.slot !== "public-entrypoint" ||
        composition.value !== "./Api"
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
        composition.causes,
      );
      projectedBarrelExportsByPath.set(path, pathBarrelExports);
    }
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

const collectProjectedTsconfigs = (blueprint: Blueprint) => {
  const projectedTsconfigs = new Map<string, ProjectedTsconfig>();

  for (const target of blueprint.targets) {
    if (target.targetId === "app/server") {
      appendProjectedTsconfig(projectedTsconfigs, {
        path: "apps/server/tsconfig.json",
        contents: serverTsconfigContents,
        causes: target.causes,
      });
      continue;
    }

    if (target.targetId === "package/domain") {
      appendProjectedTsconfig(projectedTsconfigs, {
        path: "packages/domain/tsconfig.json",
        contents: packageDomainTsconfigContents,
        causes: target.causes,
      });
    }
  }

  return new Map(projectedTsconfigs.entries());
};

const collectSnapshotPaths = (blueprint: Blueprint) => {
  const requestedPaths = new Set<string>();

  for (const projectedPath of collectProjectedPlanPaths(blueprint)) {
    requestedPaths.add(projectedPath.path);

    for (const directoryPath of collectDirectoryPaths([projectedPath.path])) {
      requestedPaths.add(directoryPath);
    }
  }

  return [...requestedPaths].sort(sortPaths);
};

const nameFromPath = (path: string) => {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFlatStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

const createPackageJsonExportMergeWarning = (
  requirement: MergeRequirement,
): PlanWarning => ({
  _tag: "mergeStrategyRequired",
  path: requirement.path,
  message: "Existing exports require manual merge strategy.",
  requirement,
});

const createPackageJsonDependencyMergeWarning = (
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

const createPackageJsonDependencyMergeRequirement = ({
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

const createPackageJsonScriptMergeWarning = (
  requirement: MergeRequirement,
): PlanWarning => ({
  _tag: "mergeStrategyRequired",
  path: requirement.path,
  message: "Existing scripts require manual merge strategy.",
  requirement,
});

const createPackageJsonScriptMergeRequirement = ({
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

const createPackageJsonExportMergeRequirement = ({
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

const createBarrelExportMergeWarning = (
  requirement: MergeRequirement,
): PlanWarning => ({
  _tag: "mergeStrategyRequired",
  path: requirement.path,
  message: "Existing barrel exports require manual merge strategy.",
  requirement,
});

const createBarrelExportMergeRequirement = ({
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

const createTsconfigMergeRequirement = ({
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

const createTsconfigMergeWarning = (
  requirement: MergeRequirement,
): PlanWarning => ({
  _tag: "mergeStrategyRequired",
  path: requirement.path,
  message: "Existing tsconfig.json requires manual merge strategy.",
  requirement,
});

const simpleBarrelExportPattern = /^export \* from "(\.[^"]*)";$/;

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
      mergeRequirements: [] as Array<MergeRequirement>,
      warnings: [] as Array<PlanWarning>,
    };
  }

  if (snapshotPath._tag !== "file") {
    throw new PlanBuildError({
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
      mergeRequirements: [] as Array<MergeRequirement>,
      warnings: [] as Array<PlanWarning>,
    };
  }

  if (snapshotPath._tag !== "file") {
    throw new PlanBuildError({
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
      mergeRequirements: [] as Array<MergeRequirement>,
      warnings: [] as Array<PlanWarning>,
    };
  }

  if (snapshotPath._tag !== "file") {
    throw new PlanBuildError({
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

const projectPlan = ({
  blueprint,
  repoSnapshot,
}: {
  blueprint: Blueprint;
  repoSnapshot: RepoSnapshot;
}): Plan => {
  const projectedPaths = collectProjectedPlanPaths(blueprint);
  const intentContents = collectBlueprintIntentContents(blueprint);
  const projectedPackageJsonExports =
    collectProjectedPackageJsonExports(blueprint);
  const projectedPackageJsonDependencies =
    collectProjectedPackageJsonDependencies(blueprint);
  const projectedPackageJsonScripts =
    collectProjectedPackageJsonScripts(blueprint);
  const projectedBarrelExports = collectProjectedBarrelExports(blueprint);
  const projectedTsconfigs = collectProjectedTsconfigs(blueprint);
  const snapshotPaths = new Map(
    repoSnapshot.paths.map(
      (snapshotPath) => [snapshotPath.path, snapshotPath] as const,
    ),
  );
  const directoryPaths = collectDirectoryPaths(
    projectedPaths.map((projectedPath) => projectedPath.path),
  );
  const fileCauseMap = new Map<
    string,
    readonly [PlanCause, ...Array<PlanCause>]
  >(
    projectedPaths.map((projectedPath) => [
      projectedPath.path,
      projectedPath.causes,
    ]),
  );
  const directoryCauseMap = new Map<
    string,
    readonly [PlanCause, ...Array<PlanCause>]
  >();

  for (const projectedPath of projectedPaths) {
    const parts = projectedPath.path.split("/");

    for (let index = 1; index < parts.length; index += 1) {
      const path = parts.slice(0, index).join("/");
      const current = directoryCauseMap.get(path);

      directoryCauseMap.set(
        path,
        current
          ? mergeCauses(current, projectedPath.causes)
          : projectedPath.causes,
      );
    }
  }

  const rootBootstrap = blueprint.repoModules.find(
    (repoModule) => repoModule.moduleId === "root-bootstrap",
  );
  const rootCauses =
    rootBootstrap?.causes ??
    projectedPaths[0]?.causes ??
    ([{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }] as const);

  const fileClassifications = new Map<string, PlanEntryClassification>();
  const mergeRequirements: Array<MergeRequirement> = [];
  const warnings: Array<PlanWarning> = [];

  for (const projectedPath of projectedPaths) {
    const intentContentsForPath = intentContents.get(projectedPath.path);
    const projectedExports = projectedPackageJsonExports.get(
      projectedPath.path,
    );
    const projectedDependencies = projectedPackageJsonDependencies.get(
      projectedPath.path,
    );
    const projectedScripts = projectedPackageJsonScripts.get(
      projectedPath.path,
    );
    const projectedBarrelExportsForPath = projectedBarrelExports.get(
      projectedPath.path,
    );
    const projectedTsconfig = projectedTsconfigs.get(projectedPath.path);

    if (
      intentContentsForPath === undefined &&
      (projectedExports !== undefined ||
        projectedDependencies !== undefined ||
        projectedScripts !== undefined)
    ) {
      const packageJsonMergePlan = planPackageJsonMerge({
        path: projectedPath.path,
        projectedExports: projectedExports ?? [],
        projectedDependencies: projectedDependencies ?? [],
        projectedScripts: projectedScripts ?? [],
        snapshotPath: snapshotPaths.get(projectedPath.path),
      });

      fileClassifications.set(
        projectedPath.path,
        packageJsonMergePlan.classification,
      );
      mergeRequirements.push(...packageJsonMergePlan.mergeRequirements);
      warnings.push(...packageJsonMergePlan.warnings);
      continue;
    }

    if (
      intentContentsForPath === undefined &&
      projectedBarrelExportsForPath !== undefined
    ) {
      const barrelMergePlan = planBarrelMerge({
        path: projectedPath.path,
        projectedBarrelExports: projectedBarrelExportsForPath,
        snapshotPath: snapshotPaths.get(projectedPath.path),
      });

      fileClassifications.set(
        projectedPath.path,
        barrelMergePlan.classification,
      );
      mergeRequirements.push(...barrelMergePlan.mergeRequirements);
      warnings.push(...barrelMergePlan.warnings);
      continue;
    }

    if (
      intentContentsForPath === undefined &&
      projectedTsconfig !== undefined
    ) {
      const tsconfigMergePlan = planTsconfigMerge({
        path: projectedPath.path,
        projectedTsconfig,
        snapshotPath: snapshotPaths.get(projectedPath.path),
      });

      fileClassifications.set(
        projectedPath.path,
        tsconfigMergePlan.classification,
      );
      mergeRequirements.push(...tsconfigMergePlan.mergeRequirements);
      warnings.push(...tsconfigMergePlan.warnings);
      continue;
    }

    if (intentContentsForPath === undefined) {
      fileClassifications.set(projectedPath.path, "create");
      continue;
    }

    const snapshotPath = snapshotPaths.get(projectedPath.path);

    if (snapshotPath === undefined || snapshotPath._tag === "missing") {
      fileClassifications.set(projectedPath.path, "create");
      continue;
    }

    if (snapshotPath._tag !== "file") {
      throw new PlanBuildError({
        reason: "repoRootNotEmpty",
        message: `Expected ${projectedPath.path} to be a file during planning.`,
      });
    }

    fileClassifications.set(
      projectedPath.path,
      snapshotPath.contents === intentContentsForPath ? "unchanged" : "modify",
    );
  }

  const entries: Array<PlanEntry> = [
    ...directoryPaths.map((path) => ({
      _tag: "directory" as const,
      path,
      causes:
        directoryCauseMap.get(path) ??
        ([{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }] as const),
    })),
    ...projectedPaths.map((projectedPath) => ({
      _tag: "file" as const,
      path: projectedPath.path,
      classification: fileClassifications.get(projectedPath.path) ?? "create",
      causes: projectedPath.causes,
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

  for (const projectedPath of projectedPaths) {
    const parentPath = projectedPath.path.includes("/")
      ? projectedPath.path.slice(0, projectedPath.path.lastIndexOf("/"))
      : ".";

    directories.get(parentPath)?.children.push({
      _tag: "file",
      name: nameFromPath(projectedPath.path),
      path: projectedPath.path,
      classification: (() => {
        const entry = entries.find(
          (planEntry) =>
            planEntry._tag === "file" && planEntry.path === projectedPath.path,
        );

        return entry?._tag === "file" ? entry.classification : "create";
      })(),
      causes: fileCauseMap.get(projectedPath.path) ?? projectedPath.causes,
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
  };
};

export const RepoSnapshotLoader = {
  load: Effect.fn("RepoSnapshotLoader.load")(function* ({
    blueprint,
    repoRoot,
  }: {
    blueprint: unknown;
    repoRoot: string;
  }) {
    const resolvedBlueprint = normalizeBlueprint(blueprint);
    const snapshotPaths = collectSnapshotPaths(resolvedBlueprint);
    const rootEntries: Array<string> = yield* Effect.tryPromise({
      try: () => readdir(repoRoot),
      catch: (error) =>
        new PlanBuildError({
          reason: "repoRootNotEmpty",
          message:
            error instanceof Error
              ? error.message
              : "Could not read repo root for planning.",
        }),
    });

    const paths: Array<RepoSnapshotPath> = [];

    for (const path of snapshotPaths) {
      const absolutePath = join(repoRoot, path);
      const pathStat = yield* Effect.tryPromise({
        try: async () => {
          try {
            return await stat(absolutePath);
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "ENOENT"
            ) {
              return null;
            }

            throw error;
          }
        },
        catch: (error) =>
          new PlanBuildError({
            reason: "repoRootNotEmpty",
            message:
              error instanceof Error
                ? error.message
                : `Could not inspect ${path} during planning.`,
          }),
      });

      if (pathStat === null) {
        paths.push({ _tag: "missing", path });
        continue;
      }

      if (pathStat.isDirectory()) {
        paths.push({ _tag: "directory", path });
        continue;
      }

      const contents = yield* Effect.tryPromise({
        try: () => readFile(absolutePath, "utf8"),
        catch: (error) =>
          new PlanBuildError({
            reason: "repoRootNotEmpty",
            message:
              error instanceof Error
                ? error.message
                : `Could not read ${path} during planning.`,
          }),
      });

      paths.push({ _tag: "file", path, contents });
    }

    return {
      rootEntries: [...rootEntries].sort((left, right) =>
        left.localeCompare(right),
      ),
      paths,
    } satisfies RepoSnapshot;
  }),
};

export const PlanService = {
  build: Effect.fn("PlanService.build")(function* ({
    blueprint,
    repoRoot,
  }: {
    blueprint: unknown;
    repoRoot: string;
  }) {
    const resolvedBlueprint = normalizeBlueprint(blueprint);
    const repoSnapshot = yield* RepoSnapshotLoader.load({
      blueprint: resolvedBlueprint,
      repoRoot,
    });

    return projectPlan({ blueprint: resolvedBlueprint, repoSnapshot });
  }),
};
