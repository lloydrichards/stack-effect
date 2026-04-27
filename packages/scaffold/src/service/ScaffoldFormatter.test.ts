import { describe, expect, layer } from "@effect/vitest";
import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import { Plan } from "@repo/domain/Plan";
import { TargetIdentity } from "@repo/domain/Scaffold";
import { Effect, String } from "effect";
import { ScaffoldFormatter } from "./ScaffolFormatter";

const domainIdentity = new TargetIdentity({ kind: "package", name: "domain" });
const serverApiIdentity = new TargetIdentity({ kind: "server", name: "api" });

const makeUnsortedBlueprint = () =>
  new Blueprint({
    nodes: [
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api"),
        targetId: domainIdentity.toKey(),
        moduleId: "domain-api",
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
          "http-api-server",
        ),
        targetId: serverApiIdentity.toKey(),
        moduleId: "http-api-server",
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
          "http-api-server",
        ),
        to: toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api"),
        reason: "required-module",
      },
      {
        id: "m-edge",
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api"),
        reason: "owns-module",
      },
      {
        id: "n-edge",
        from: serverApiIdentity.toKey(),
        to: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          "http-api-server",
        ),
        reason: "owns-module",
      },
      {
        id: "a-edge",
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          "http-api-server",
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

        expect(yield* formatter.formatBlueprint(blueprint)).toBe("Blueprint");
      }),
    );

    it.effect("formats a normalized dependency blueprint", () =>
      Effect.gen(function* () {
        const formatter = yield* ScaffoldFormatter;
        const blueprint = makeUnsortedBlueprint().toSorted();

        expect(yield* formatter.formatBlueprint(blueprint)).toBe(
          String.stripMargin(`|Blueprint
           |
           |Targets
           |- apps/server-api (server)
           | └╌> apps/server-api#http-api-server
           |      ├─> packages/domain [required-target]
           |      └─> packages/domain#domain-api [required-module]
           |- packages/domain (package)
           | └╌> packages/domain#domain-api`),
        );
      }),
    );

    it.effect("formats an empty plan", () =>
      Effect.gen(function* () {
        const formatter = yield* ScaffoldFormatter;
        const plan = new Plan({
          outcomes: [],
          conflicts: [],
        });

        expect(yield* formatter.formatPlan(plan)).toBe(
          String.stripMargin(`|Plan
           |
           |Legend: [+] create  [~] modify  [=] unchanged  [!] needs merge
           |
           |Summary: 0 create  0 modify  0 unchanged  0 merge
           |
           |.`),
        );
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
                _tag: "authoritative",
                path: "packages/domain/src/Api.ts",
                classification: "create",
                contents: 'export const Api = "Api";\n',
              },
              {
                _tag: "structural",
                path: "packages/domain/src/index.ts",
                classification: "needsMergeStrategy",
                requiredStructure: { reExports: ["./Api"] },
              },
              {
                _tag: "authoritative",
                path: "packages/domain/tsconfig.json",
                classification: "needsMergeStrategy",
                contents:
                  '{"extends":"../../packages/config-typescript/base.json"}',
              },
              {
                _tag: "authoritative",
                path: "README.md",
                classification: "modify",
                contents: "# Repo\n",
              },
              {
                _tag: "structural",
                path: "package.json",
                classification: "unchanged",
                requiredStructure: {
                  packageJsonScripts: [
                    {
                      scriptName: "build",
                      scriptValue: "tsc -p tsconfig.json",
                    },
                  ],
                },
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

          expect(yield* formatter.formatPlan(plan)).toBe(
            String.stripMargin(`|Plan
             |
             |Legend: [+] create  [~] modify  [=] unchanged  [!] needs merge
             |
             |Summary: 1 create  1 modify  1 unchanged  2 merge
             |
             |.
             |├── packages
             |│   └── domain
             |│       ├── src
             |│       │   ├── [+] Api.ts
             |│       │   └── [!] index.ts
             |│       │       merge: export ./Api
             |│       └── [!] tsconfig.json
             |│           merge: tsconfig
             |├── [=] package.json
             |└── [~] README.md`),
          );
        }),
    );
  });
});
