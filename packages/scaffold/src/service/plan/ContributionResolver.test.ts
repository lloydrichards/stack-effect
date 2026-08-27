import { describe, expect, it } from "@effect/vitest";
import {
  ArchitectureId,
  ContextId,
  Contribution,
  TargetIdentity,
  TargetKind,
  TargetPath,
} from "@repo/domain/Catalog";
import { ContributionTokenContext, StackConfig } from "@repo/domain/Scaffold";
import { resolveContributionTokens } from "./ContributionResolver";

const token =
  "{{targetPath}}|{{targetDir}}|{{packageName}}|{{architecture}}|{{contextId}}|{{contextRole}}";
const resolved = "custom/todo|custom/todo|@custom/todo|future|todo|host";
const context = new ContributionTokenContext({
  targetKey: new TargetIdentity({
    kind: TargetKind.make("server"),
    name: "logical",
  }).toKey(),
  identity: new TargetIdentity({
    kind: TargetKind.make("server"),
    name: "logical",
  }),
  architecture: ArchitectureId.make("future"),
  layout: { path: TargetPath.make("custom/todo"), packageName: "@custom/todo" },
  context: { id: ContextId.make("todo"), role: "host" },
  config: new StackConfig({ name: "fixture", runtime: { _tag: "bun" } }),
});

const fullImport = {
  moduleSpecifier: token,
  namedImports: [token],
  defaultImport: token,
  namespaceImport: token,
};

const contributions: ReadonlyArray<typeof Contribution.Type> = [
  Contribution.cases.file.make({ path: token, contents: token }),
  Contribution.cases["pkg-json-entry"].make({
    path: token,
    field: "dependencies",
    name: token,
    value: token,
  }),
  Contribution.cases["barrel-export"].make({
    barrelPath: token,
    exportPath: token,
  }),
  Contribution.cases["ts-call-arg"].make({
    path: token,
    targetVariable: token,
    functionName: token,
    argument: token,
    import: fullImport,
  }),
  Contribution.cases["ts-object-field"].make({
    path: token,
    targetVariable: token,
    functionName: token,
    field: token,
    value: token,
    import: fullImport,
  }),
  Contribution.cases["jsx-slot"].make({
    path: token,
    slotId: token,
    content: token,
    import: fullImport,
  }),
  Contribution.cases["json-array-entry"].make({
    path: token,
    field: "workspaces",
    value: token,
  }),
  Contribution.cases["yaml-sequence-entry"].make({
    path: token,
    key: "packages",
    value: token,
  }),
];

describe("ContributionResolver token boundary", () => {
  it("resolves every string-bearing contribution field before compilation", () => {
    const output = resolveContributionTokens(contributions, context);
    const strings = JSON.stringify(output);
    expect(strings).not.toContain("{{");
    expect(
      strings.match(new RegExp(resolved.replace(/[|/]/g, "\\$&"), "g"))?.length,
    ).toBeGreaterThan(20);
  });

  it("keeps optional import properties physically absent when omitted", () => {
    const [call, object, jsx] = resolveContributionTokens(
      [
        Contribution.cases["ts-call-arg"].make({
          path: "a.ts",
          targetVariable: "A",
          functionName: "f",
          argument: "x",
          import: { moduleSpecifier: "m" },
        }),
        Contribution.cases["ts-object-field"].make({
          path: "b.ts",
          targetVariable: "B",
          functionName: "f",
          field: "x",
          value: "1",
        }),
        Contribution.cases["jsx-slot"].make({
          path: "c.tsx",
          slotId: "main",
          content: "<X />",
        }),
      ],
      context,
    );

    expect(call && "import" in call && call.import).toEqual({
      moduleSpecifier: "m",
    });
    expect(object && "import" in object).toBe(false);
    expect(jsx && "import" in jsx).toBe(false);
  });

  it("preserves Classic identity-layout output", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "api",
    });
    const classic = new ContributionTokenContext({
      targetKey: identity.toKey(),
      identity,
      architecture: ArchitectureId.make("classic"),
      layout: {
        path: identity.toPath(),
        packageName: identity.toPackageName(),
      },
      config: new StackConfig({ name: "fixture", runtime: { _tag: "bun" } }),
    });
    expect(classic.resolve("{{targetPath}}/{{packageName}}")).toBe(
      "apps/server-api/server-api",
    );
  });
});
