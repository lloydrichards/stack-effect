import { describe, expect, layer } from "@effect/vitest";
import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { Plan } from "@repo/domain/Plan";
import { Effect, String } from "effect";
import { Box } from "effect-boxes";
import { ScaffoldFormatter } from "./ScaffolFormatter";

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
      {
        id: "z-edge",
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        reason: "required-module",
      },
      {
        id: "m-edge",
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        reason: "owns-module",
      },
      {
        id: "n-edge",
        from: serverApiIdentity.toKey(),
        to: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        reason: "owns-module",
      },
      {
        id: "a-edge",
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        to: domainIdentity.toKey(),
        reason: "required-target",
      },
    ],
  });

describe("ScaffoldFormatter", () => {
  layer(ScaffoldFormatter.layer)("formatters", (it) => {
    it.effect("formats an empty blueprint", () =>
      Effect.gen(function* () {
        const formatter = yield* ScaffoldFormatter;
        const blueprint = new Blueprint({
          nodes: [],
          edges: [],
        });

        const result = yield* formatter.formatBlueprint(blueprint);
        expect(result.title).toBe("Blueprint");
      }),
    );

    it.effect("formats a normalized dependency blueprint", () =>
      Effect.gen(function* () {
        const formatter = yield* ScaffoldFormatter;
        const blueprint = makeUnsortedBlueprint().toSorted();

        const result = yield* formatter.formatBlueprint(blueprint);
        const rendered = Box.renderPlainSync(result.content);
        expect(result.title).toBe("Blueprint");
        expect(rendered).toContain("apps/server-api");
        expect(rendered).toContain("server-http-api");
        expect(rendered).toContain("packages/domain");
        expect(rendered).toContain("domain-api-contracts");
        expect(rendered).toContain("required-target");
        expect(rendered).toContain("required-module");
      }),
    );

    it.effect("formats an empty plan", () =>
      Effect.gen(function* () {
        const formatter = yield* ScaffoldFormatter;
        const plan = new Plan({
          outcomes: [],
          conflicts: [],
        });

        const result = yield* formatter.formatPlan(plan);
        expect(result.title).toBe("Plan");
        expect(Box.renderPlainSync(result.legend)).toBe(
          "[+] create  [~] modify  [=] unchanged  [!] needs merge",
        );
        expect(result.summary).toBe("0 create  0 modify  0 unchanged  0 merge");
        expect(Box.renderPlainSync(result.tree).trim()).toBe(".");
      }),
    );

    it.effect(
      "formats a plan with create, modify, unchanged, and merge conflicts",
      () =>
        Effect.gen(function* () {
          const formatter = yield* ScaffoldFormatter;
          const plan = new Plan({
            outcomes: [
              {
                _tag: "complete",
                path: "packages/domain/src/Api.ts",
                classification: "create",
                contents: 'export const Api = "Api";\n',
              },
              {
                _tag: "composed",
                path: "packages/domain/src/index.ts",
                classification: "conflict",
                seedContents: "",
                operations: [
                  {
                    _tag: "ts-add-reexport",
                    fileType: "typescript",
                    moduleSpecifier: "./Api",
                  },
                ],
              },
              {
                _tag: "complete",
                path: "packages/domain/tsconfig.json",
                classification: "conflict",
                contents:
                  '{"extends":"../../packages/config-typescript/base.json"}',
              },
              {
                _tag: "complete",
                path: "README.md",
                classification: "modify",
                contents: "# Repo\n",
              },
              {
                _tag: "composed",
                path: "package.json",
                classification: "unchanged",
                seedContents: "{}",
                operations: [
                  {
                    _tag: "json-pkg-scripts",
                    fileType: "json",
                    entries: [
                      {
                        name: "build",
                        value: "tsc -p tsconfig.json",
                      },
                    ],
                  },
                ],
              },
            ],
            conflicts: [
              {
                _tag: "barrelExport",
                path: "packages/domain/src/index.ts",
                exportPath: "./Api",
              },
              {
                _tag: "tsconfig",
                path: "packages/domain/tsconfig.json",
              },
            ],
          }).toSorted();

          const result = yield* formatter.formatPlan(plan);
          expect(result.title).toBe("Plan");
          expect(Box.renderPlainSync(result.legend)).toBe(
            "[+] create  [~] modify  [=] unchanged  [!] needs merge",
          );
          expect(result.summary).toBe(
            "1 create  1 modify  1 unchanged  2 merge",
          );
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
              |│       │   ├── [+] Api.ts
              |│       │   ╰── [!] index.ts
              |│       │       ╰── merge: export ./Api
              |│       ╰── [!] tsconfig.json
              |│           ╰── merge: tsconfig
              |├── [=] package.json
              |╰── [~] README.md`),
          );
        }),
    );
  });
});
