import {
  MergeRequirement,
  type MergeRequirement as MergeRequirementType,
  mergePlanCauses,
  Plan,
  PlanEntryClassification,
  type Plan as PlanType,
  PlanWarning,
  type PlanWarning as PlanWarningType,
  toPlanRepoModuleCauses,
  toPlanTargetCauses,
  toPlanTargetCompositionCauses,
  toPlanTargetModuleCauses,
} from "@repo/domain/Plan";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const decodePlanEntryClassification = Schema.decodeUnknownSync(
  PlanEntryClassification,
);
const decodePlan = Schema.decodeUnknownSync(Plan as never) as (
  input: unknown,
) => PlanType;
const decodeMergeRequirement = Schema.decodeUnknownSync(
  MergeRequirement as never,
) as (input: unknown) => MergeRequirementType;
const decodePlanWarning = Schema.decodeUnknownSync(PlanWarning as never) as (
  input: unknown,
) => PlanWarningType;

describe("@repo/domain Plan", () => {
  it("accepts the supported plan classifications", () => {
    expect(decodePlanEntryClassification("create")).toBe("create");
    expect(decodePlanEntryClassification("modify")).toBe("modify");
    expect(decodePlanEntryClassification("unchanged")).toBe("unchanged");
    expect(decodePlanEntryClassification("needsMergeStrategy")).toBe(
      "needsMergeStrategy",
    );
  });

  it("rejects unsupported classifications", () => {
    expect(() => decodePlanEntryClassification("delete")).toThrow();
  });

  it("models a deterministic narrow public plan", () => {
    const plan = decodePlan({
      entries: [
        {
          _tag: "directory",
          path: "packages/domain",
          causes: [{ _tag: "selectedTarget", targetId: "packages/domain" }],
        },
        {
          _tag: "file",
          path: "packages/domain/src/Api.ts",
          classification: "create",
          causes: [
            {
              _tag: "impliedTargetModule",
              targetId: "packages/domain",
              moduleId: "domain-api",
              via: "apps/server-api:http-api-server",
            },
          ],
        },
      ],
      tree: {
        _tag: "directory",
        name: ".",
        path: ".",
        causes: [{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }],
        children: [
          {
            _tag: "directory",
            name: "packages",
            path: "packages",
            causes: [{ _tag: "selectedTarget", targetId: "packages/domain" }],
            children: [
              {
                _tag: "directory",
                name: "domain",
                path: "packages/domain",
                causes: [
                  { _tag: "selectedTarget", targetId: "packages/domain" },
                ],
                children: [
                  {
                    _tag: "file",
                    name: "package.json",
                    path: "packages/domain/package.json",
                    classification: "modify",
                    causes: [
                      {
                        _tag: "targetComposition",
                        targetId: "packages/domain",
                        slot: "public-entrypoint",
                        value: "./Api",
                      },
                    ],
                  },
                  {
                    _tag: "file",
                    name: "Api.ts",
                    path: "packages/domain/src/Api.ts",
                    classification: "create",
                    causes: [
                      {
                        _tag: "impliedTargetModule",
                        targetId: "packages/domain",
                        moduleId: "domain-api",
                        via: "apps/server-api:http-api-server",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      mergeRequirements: [
        {
          _tag: "packageJsonExports",
          path: "packages/domain/package.json",
          exportKey: "./Api",
          causes: [
            {
              _tag: "targetComposition",
              targetId: "packages/domain",
              slot: "public-entrypoint",
              value: "./Api",
            },
          ],
        },
      ],
      warnings: [
        {
          _tag: "mergeStrategyRequired",
          path: "packages/domain/package.json",
          message: "Existing exports require manual merge strategy.",
          requirement: {
            _tag: "packageJsonExports",
            path: "packages/domain/package.json",
            exportKey: "./Api",
            causes: [
              {
                _tag: "targetComposition",
                targetId: "packages/domain",
                slot: "public-entrypoint",
                value: "./Api",
              },
            ],
          },
        },
      ],
    });

    expect(plan.entries.map((entry) => entry.path)).toStrictEqual([
      "packages/domain",
      "packages/domain/src/Api.ts",
    ]);
    expect(plan.tree.children).toHaveLength(1);
    expect(plan.mergeRequirements).toHaveLength(1);
    expect(plan.warnings).toHaveLength(1);
  });

  it("allows merge requirements to be decoded independently", () => {
    const requirement = decodeMergeRequirement({
      _tag: "authoritativeFile",
      path: "package.json",
      causes: [{ _tag: "selectedRepoModule", moduleId: "root-bootstrap" }],
    });

    expect(requirement._tag).toBe("authoritativeFile");
  });

  it("allows warnings to be decoded independently", () => {
    const warning = decodePlanWarning({
      _tag: "impliedDependency",
      path: "packages/domain/src/Api.ts",
      message: "Added because app/server selected http-api-server.",
      causes: [
        {
          _tag: "impliedTargetModule",
          targetId: "packages/domain",
          moduleId: "domain-api",
          via: "apps/server-api:http-api-server",
        },
      ],
    });

    expect(warning._tag).toBe("impliedDependency");
  });

  it("sorts plan entries, tree children, merge requirements, warnings, and causes deterministically", () => {
    const plan = new Plan({
      entries: [
        {
          _tag: "file",
          path: "packages/domain/src/Api.ts",
          classification: "create",
          causes: [
            {
              _tag: "selectedTarget",
              targetId: "packages/domain",
            },
            {
              _tag: "impliedTargetModule",
              targetId: "packages/domain",
              moduleId: "domain-api",
              via: "apps/server-api:http-api-server",
            },
          ],
        },
        {
          _tag: "directory",
          path: "packages/domain",
          causes: [
            {
              _tag: "selectedTarget",
              targetId: "packages/domain",
            },
          ],
        },
      ],
      tree: {
        _tag: "directory",
        name: ".",
        path: ".",
        causes: [
          {
            _tag: "selectedRepoModule",
            moduleId: "root-bootstrap",
          },
        ],
        children: [
          {
            _tag: "file",
            name: "README.md",
            path: "README.md",
            classification: "modify",
            causes: [
              {
                _tag: "selectedRepoModule",
                moduleId: "root-bootstrap",
              },
            ],
          },
          {
            _tag: "directory",
            name: "packages",
            path: "packages",
            causes: [
              {
                _tag: "selectedTarget",
                targetId: "packages/domain",
              },
            ],
            children: [],
          },
        ],
      },
      mergeRequirements: [
        {
          _tag: "tsconfig",
          path: "packages/domain/tsconfig.json",
          causes: [
            {
              _tag: "selectedTarget",
              targetId: "packages/domain",
            },
          ],
        },
        {
          _tag: "barrelExport",
          path: "packages/domain/src/index.ts",
          exportPath: "./Api",
          causes: [
            {
              _tag: "targetComposition",
              targetId: "packages/domain",
              slot: "public-entrypoint",
              value: "./Api",
            },
          ],
        },
      ],
      warnings: [
        {
          _tag: "mergeStrategyRequired",
          path: "packages/domain/tsconfig.json",
          message: "Existing tsconfig.json requires manual merge strategy.",
          requirement: {
            _tag: "tsconfig",
            path: "packages/domain/tsconfig.json",
            causes: [
              {
                _tag: "selectedTarget",
                targetId: "packages/domain",
              },
            ],
          },
        },
        {
          _tag: "impliedDependency",
          path: "packages/domain/src/Api.ts",
          message: "Added because app/server selected http-api-server.",
          causes: [
            {
              _tag: "selectedTarget",
              targetId: "packages/domain",
            },
            {
              _tag: "impliedTargetModule",
              targetId: "packages/domain",
              moduleId: "domain-api",
              via: "apps/server-api:http-api-server",
            },
          ],
        },
      ],
    }).toSorted();

    expect(plan.entries.map((entry) => entry.path)).toEqual([
      "packages/domain",
      "packages/domain/src/Api.ts",
    ]);
    expect(plan.entries[1]?.causes).toEqual([
      {
        _tag: "impliedTargetModule",
        targetId: "packages/domain",
        moduleId: "domain-api",
        via: "apps/server-api:http-api-server",
      },
      {
        _tag: "selectedTarget",
        targetId: "packages/domain",
      },
    ]);
    expect(plan.tree.children.map((child) => child.path)).toEqual([
      "packages",
      "README.md",
    ]);
    expect(
      plan.mergeRequirements.map((requirement) => requirement.path),
    ).toEqual([
      "packages/domain/src/index.ts",
      "packages/domain/tsconfig.json",
    ]);
    expect(plan.warnings.map((warning) => warning.path)).toEqual([
      "packages/domain/src/Api.ts",
      "packages/domain/tsconfig.json",
    ]);
  });

  it("deduplicates and sorts merged plan causes", () => {
    const causes = mergePlanCauses(
      [
        {
          _tag: "selectedTarget",
          targetId: "packages/domain",
        },
        {
          _tag: "impliedTargetModule",
          targetId: "packages/domain",
          moduleId: "domain-api",
          via: "z-edge",
        },
      ],
      [
        {
          _tag: "impliedTargetModule",
          targetId: "packages/domain",
          moduleId: "domain-api",
          via: "a-edge",
        },
        {
          _tag: "selectedTarget",
          targetId: "packages/domain",
        },
      ],
    );

    expect(causes).toEqual([
      {
        _tag: "impliedTargetModule",
        targetId: "packages/domain",
        moduleId: "domain-api",
        via: "a-edge",
      },
      {
        _tag: "impliedTargetModule",
        targetId: "packages/domain",
        moduleId: "domain-api",
        via: "z-edge",
      },
      {
        _tag: "selectedTarget",
        targetId: "packages/domain",
      },
    ]);
  });

  it("converts blueprint target, target module, repo module, and composition causes into plan causes", () => {
    const targetCauses = toPlanTargetCauses({
      target: {
        id: "packages/domain",
        identity: {
          kind: "package",
          name: "domain",
        },
        status: "selected",
        causes: [
          {
            _tag: "selection",
            source: {
              _tag: "target",
              id: "packages/domain",
            },
          },
          {
            _tag: "dependency",
            edgeId:
              "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
          },
        ],
        targetModules: [],
        composition: {
          _tag: "package",
          publicEntrypoint: "./Api",
        },
      },
    });

    const targetModuleCauses = toPlanTargetModuleCauses({
      targetId: "packages/domain",
      targetModule: {
        moduleId: "domain-api",
        status: "selected",
        causes: [
          {
            _tag: "selection",
            source: {
              _tag: "target-module",
              targetId: "packages/domain",
              moduleId: "domain-api",
            },
          },
          {
            _tag: "dependency",
            edgeId:
              "required-target-module=>target-module:apps/server-api:http-api-server=>target-module:packages/domain:domain-api",
          },
        ],
      },
    });

    const repoModuleCauses = toPlanRepoModuleCauses({
      repoModule: {
        moduleId: "root-bootstrap",
        status: "implied",
        causes: [
          {
            _tag: "dependency",
            edgeId:
              "required-repo-module=>target:packages/domain=>repo-module:root-bootstrap",
          },
        ],
      },
    });

    const compositionCauses = toPlanTargetCompositionCauses({
      target: {
        id: "packages/domain",
        identity: {
          kind: "package",
          name: "domain",
        },
        status: "selected",
        causes: [
          {
            _tag: "selection",
            source: {
              _tag: "target",
              id: "packages/domain",
            },
          },
        ],
        targetModules: [],
        composition: {
          _tag: "package",
          publicEntrypoint: "./Api",
        },
      },
      composition: {
        _tag: "package",
        publicEntrypoint: "./Api",
      },
    });

    expect(targetCauses).toEqual([
      {
        _tag: "impliedTarget",
        targetId: "packages/domain",
        via: "required-canonical-target=>target-module:apps/server-api:http-api-server=>target:packages/domain",
      },
      {
        _tag: "selectedTarget",
        targetId: "packages/domain",
      },
    ]);
    expect(targetModuleCauses).toEqual([
      {
        _tag: "impliedTargetModule",
        targetId: "packages/domain",
        moduleId: "domain-api",
        via: "packages/domain:domain-api",
      },
      {
        _tag: "impliedTargetModule",
        targetId: "packages/domain",
        moduleId: "domain-api",
        via: "required-target-module=>target-module:apps/server-api:http-api-server=>target-module:packages/domain:domain-api",
      },
    ]);
    expect(repoModuleCauses).toEqual([
      {
        _tag: "selectedRepoModule",
        moduleId: "root-bootstrap",
      },
    ]);
    expect(compositionCauses).toEqual([
      {
        _tag: "targetComposition",
        targetId: "packages/domain",
        slot: "public-entrypoint",
        value: "./Api",
      },
    ]);
  });
});
