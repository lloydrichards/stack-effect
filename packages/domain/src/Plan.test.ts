import {
  MergeRequirement,
  type MergeRequirement as MergeRequirementType,
  Plan,
  PlanEntryClassification,
  PlanWarning,
  type PlanWarning as PlanWarningType,
  type Plan as PlanType,
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
          causes: [{ _tag: "selectedTarget", targetId: "package/domain" }],
        },
        {
          _tag: "file",
          path: "packages/domain/src/Api.ts",
          classification: "create",
          causes: [
            {
              _tag: "impliedTargetModule",
              targetId: "package/domain",
              moduleId: "domain-api",
              via: "app/server:http-api-server",
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
            causes: [{ _tag: "selectedTarget", targetId: "package/domain" }],
            children: [
              {
                _tag: "directory",
                name: "domain",
                path: "packages/domain",
                causes: [
                  { _tag: "selectedTarget", targetId: "package/domain" },
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
                        targetId: "package/domain",
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
                        targetId: "package/domain",
                        moduleId: "domain-api",
                        via: "app/server:http-api-server",
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
              targetId: "package/domain",
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
                targetId: "package/domain",
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
          targetId: "package/domain",
          moduleId: "domain-api",
          via: "app/server:http-api-server",
        },
      ],
    });

    expect(warning._tag).toBe("impliedDependency");
  });
});
