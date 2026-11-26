import { describe, expect, it } from "@effect/vitest";
import {
  Blueprint,
  makeBlueprintEdge,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { Plan, RepositoryPath } from "@repo/domain/Plan";
import { String } from "effect";
import { Box } from "effect-boxes";
import * as ScaffoldTree from "../../src/components/ScaffoldTree";

const domainIdentity = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "domain",
});
const serverApiIdentity = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "api",
});

const makeUnsortedBlueprint = () =>
  new Blueprint({
    nodes: [
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        targetId: domainIdentity.toKey(),
        moduleId: ModuleId.make("domain-api-contracts"),
      },
      {
        _tag: "target",
        id: domainIdentity.toKey(),
        identity: domainIdentity,
      },
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        targetId: serverApiIdentity.toKey(),
        moduleId: ModuleId.make("server-http-api"),
      },
      {
        _tag: "target",
        id: serverApiIdentity.toKey(),
        identity: serverApiIdentity,
      },
    ],
    edges: [
      makeBlueprintEdge(
        "required-module",
        toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
      ),
      makeBlueprintEdge(
        "owns-module",
        domainIdentity.toKey(),
        toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
      ),
      makeBlueprintEdge(
        "owns-module",
        serverApiIdentity.toKey(),
        toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
      ),
      makeBlueprintEdge(
        "required-target",
        toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        domainIdentity.toKey(),
      ),
    ],
  });

describe("ScaffoldTree", () => {
  it("should format an empty Blueprint when no nodes exist", () => {
    const blueprint = new Blueprint({
      nodes: [],
      edges: [],
    });

    const result = ScaffoldTree.formatBlueprint(blueprint);
    expect(result.title).toBe("Blueprint");
  });

  it("should format dependencies when a Blueprint is normalized", () => {
    const blueprint = makeUnsortedBlueprint().toSorted();

    const result = ScaffoldTree.formatBlueprint(blueprint);
    const rendered = Box.renderPlainSync(result.content);
    expect(result.title).toBe("Blueprint");
    expect(rendered).toContain("apps/server-api");
    expect(rendered).toContain("server-http-api");
    expect(rendered).toContain("packages/domain");
    expect(rendered).toContain("domain-api-contracts");
    expect(rendered).toContain("required-target");
    expect(rendered).toContain("required-module");
  });

  it("should format an empty Plan when no outcomes exist", () => {
    const plan = new Plan({
      baseline: { root: "/repo", paths: [] },
      outcomes: [],
      conflicts: [],
    });

    const result = ScaffoldTree.formatPlan(plan);
    expect(result.title).toBe("Plan");
    expect(Box.renderPlainSync(result.legend)).toBe(
      "[+] create  [~] modify  [=] unchanged  [!] needs merge",
    );
    expect(result.summary).toBe("0 create  0 modify  0 unchanged  0 merge");
    expect(Box.renderPlainSync(result.tree).trim()).toBe(".");
  });

  it("should format outcomes and diagnostics when a Plan is mixed", () => {
    const plan = new Plan({
      baseline: {
        root: "/repo",
        paths: [
          "packages/domain/src/Api.ts",
          "packages/domain/package.json",
          "packages/domain/tsconfig.json",
          "README.md",
          "package.json",
        ].map((path) => ({
          _tag: "missing" as const,
          path: RepositoryPath.make(path),
        })),
      },
      outcomes: [
        {
          _tag: "complete",
          path: RepositoryPath.make("packages/domain/src/Api.ts"),
          classification: "create",
          contents: 'export const Api = "Api";\n',
        },
        {
          _tag: "composed",
          path: RepositoryPath.make("packages/domain/package.json"),
          classification: "conflict",
          seedContents: "{}",
          operations: [
            {
              _tag: "json-pkg-exports",
              fileType: "json",
              entries: [
                { name: "./Api", value: "./src/Api.ts" },
                { name: "./Health", value: "./src/Health.ts" },
              ],
            },
          ],
        },
        {
          _tag: "complete",
          path: RepositoryPath.make("packages/domain/tsconfig.json"),
          classification: "conflict",
          contents: '{"extends":"../../packages/config-typescript/base.json"}',
        },
        {
          _tag: "complete",
          path: RepositoryPath.make("README.md"),
          classification: "modify",
          contents: "# Repo\n",
        },
        {
          _tag: "composed",
          path: RepositoryPath.make("package.json"),
          classification: "unchanged",
          seedContents: "{}",
          operations: [
            {
              _tag: "json-pkg-scripts",
              fileType: "json",
              entries: [{ name: "build", value: "tsc -p tsconfig.json" }],
            },
          ],
        },
      ],
      conflicts: [
        {
          _tag: "exports",
          path: RepositoryPath.make("packages/domain/package.json"),
          name: "./Api",
        },
        {
          _tag: "exports",
          path: RepositoryPath.make("packages/domain/package.json"),
          name: "./Health",
        },
        {
          _tag: "dependencies",
          path: RepositoryPath.make("packages/domain/package.json"),
          name: "effect",
          section: "dependencies",
          currentVersion: "4.1.4",
          requiredVersion: "4.1.6",
        },
        {
          _tag: "completeFile",
          path: RepositoryPath.make("packages/domain/tsconfig.json"),
        },
      ],
    }).toSorted();

    const result = ScaffoldTree.formatPlan(plan);
    expect(result.title).toBe("Plan");
    expect(Box.renderPlainSync(result.legend)).toBe(
      "[+] create  [~] modify  [=] unchanged  [!] needs merge",
    );
    expect(result.summary).toBe("1 create  1 modify  1 unchanged  2 merge");
    // NOTE: Box.renderPlainSync pads lines to equal width, so assertions trim trailing spaces.
    const trimmedTree = Box.renderPlainSync(result.tree)
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();
    expect(trimmedTree).toBe(
      String.stripMargin(`|.
              |├── packages
              |│   ╰── domain
              |│       ├── src
              |│       │   ╰── [+] Api.ts
              |│       ├── [!] package.json
              |│       │   ├── dependency conflict: dependencies.effect (declared "4.1.4", requires "4.1.6")
              |│       │   ├── merge: exports ./Api
              |│       │   ╰── merge: exports ./Health
              |│       ╰── [!] tsconfig.json
              |│           ╰── override replaces the entire file
              |├── [=] package.json
              |╰── [~] README.md`),
    );
  });

  it("should identify the slot when JSX composition conflicts", () => {
    const plan = new Plan({
      baseline: {
        root: "/repo",
        paths: [
          {
            _tag: "missing",
            path: RepositoryPath.make("apps/web/src/App.tsx"),
          },
        ],
      },
      outcomes: [
        {
          _tag: "composed",
          path: RepositoryPath.make("apps/web/src/App.tsx"),
          classification: "conflict",
          operations: [
            {
              _tag: "ts-jsx-slot",
              fileType: "typescript",
              slotId: "components",
              content: "<Card />",
            },
          ],
        },
      ],
      conflicts: [
        {
          _tag: "jsxSlotTargetNotFound",
          path: RepositoryPath.make("apps/web/src/App.tsx"),
          slotId: "components",
        },
      ],
    });

    const result = ScaffoldTree.formatPlan(plan);
    expect(Box.renderPlainSync(result.tree)).toContain(
      "JSX slot target not found: components",
    );
  });
});
