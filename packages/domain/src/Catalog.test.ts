import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ArchitectureId,
  ClassicArchitecture,
  ContextId,
  Contribution,
  DddArchitecture,
  ModuleDefinition,
  ModuleId,
  ModuleImplication,
  TargetDefinition,
  TargetIdentity,
  TargetKind,
} from "./Catalog";

describe("@repo/domain Catalog architecture contracts", () => {
  it("provides branded classic and DDD architecture values", () => {
    expect(ClassicArchitecture).toBe("classic");
    expect(DddArchitecture).toBe("ddd");
    expect(Schema.decodeUnknownSync(ArchitectureId)("future")).toBe("future");
    expect(Schema.decodeUnknownSync(ContextId)("todo")).toBe("todo");
  });

  it("keeps legacy target and module definitions decodable as Classic", () => {
    const target = Schema.decodeUnknownSync(TargetDefinition)({
      kind: "server",
      title: "Server",
      description: "Server target",
      contributions: [],
    });
    const module = Schema.decodeUnknownSync(ModuleDefinition)({
      id: "server-http-api",
      title: "HTTP",
      description: "HTTP server",
      supportedOn: [{ _tag: "kind", kind: "server" }],
      dependencies: [],
      contributions: [],
    });

    expect(target.architecture).toBeUndefined();
    expect(module.architecture).toBeUndefined();
    expect(
      Schema.decodeUnknownSync(ModuleImplication)({
        targetKind: "server",
        moduleId: "server-http-api",
      }),
    ).toEqual({
      targetKind: "server",
      moduleId: "server-http-api",
    });
  });

  it("decodes architecture variants that replace attachment and implication metadata", () => {
    const exactApi = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "todo-api",
    });
    const definition = Schema.decodeUnknownSync(ModuleDefinition)({
      id: "client-react-http-api-todos",
      title: "Todo client",
      description: "Todo client",
      supportedOn: [{ _tag: "kind", kind: "client-react" }],
      dependencies: [],
      implies: [{ targetKind: "server", moduleId: "server-http-api-todos" }],
      contributions: [],
      architecture: {
        default: "classic",
        variants: [
          {
            id: "ddd",
            supportedOn: [
              {
                _tag: "identity",
                identity: { kind: "client-react", name: "web" },
              },
            ],
            dependencies: [],
            implies: [
              {
                targetKind: "server",
                target: exactApi,
                moduleId: "server-http-api-todos",
                reason: "The Todo client requires the Todo API.",
              },
            ],
            contributions: [],
          },
        ],
      },
    });

    expect(definition.architecture?.variants[0]?.supportedOn).toEqual([
      {
        _tag: "identity",
        identity: expect.objectContaining({
          kind: "client-react",
          name: "web",
        }),
      },
    ]);
    expect(definition.architecture?.variants[0]?.implies).toEqual([
      {
        targetKind: "server",
        target: expect.objectContaining({ kind: "server", name: "todo-api" }),
        moduleId: "server-http-api-todos",
        reason: "The Todo client requires the Todo API.",
      },
    ]);
  });

  it.each([
    [
      "json-array-entry",
      { path: "package.json", field: "workspaces", value: "packages/*/*" },
    ],
    [
      "yaml-sequence-entry",
      { path: "pnpm-workspace.yaml", key: "packages", value: "packages/*/*" },
    ],
  ] as const)(
    "decodes valid %s contributions and preserves path/key/value",
    (_tag, fields) => {
      const decoded = Schema.decodeUnknownSync(Contribution)({
        _tag,
        ...fields,
      });
      expect(decoded).toMatchObject({ _tag, ...fields });
    },
  );

  it.each([
    { _tag: "json-array-entry", field: "workspaces", value: "packages/*/*" },
    { _tag: "json-array-entry", path: "package.json", value: "packages/*/*" },
    {
      _tag: "json-array-entry",
      path: "package.json",
      field: "dependencies",
      value: "packages/*/*",
    },
    { _tag: "json-array-entry", path: "package.json", field: "workspaces" },
    { _tag: "yaml-sequence-entry", key: "packages", value: "packages/*/*" },
    {
      _tag: "yaml-sequence-entry",
      path: "pnpm-workspace.yaml",
      value: "packages/*/*",
    },
    {
      _tag: "yaml-sequence-entry",
      path: "pnpm-workspace.yaml",
      key: "workspaces",
      value: "packages/*/*",
    },
    {
      _tag: "yaml-sequence-entry",
      path: "pnpm-workspace.yaml",
      key: "packages",
    },
  ])("rejects malformed workspace contribution %#", (input) => {
    expect(() => Schema.decodeUnknownSync(Contribution)(input)).toThrow();
  });

  it("rejects duplicate and default-equal architecture variants", () => {
    const base = {
      kind: TargetKind.make("server"),
      title: "Server",
      description: "Server target",
      contributions: [],
    };
    const variant = {
      id: DddArchitecture,
      supportedOn: [{ _tag: "kind" as const, kind: TargetKind.make("server") }],
      requiredModules: [ModuleId.make("server-http-api")],
      contributions: [],
      layout: { _tag: "identity" as const },
    };

    expect(() =>
      Schema.decodeUnknownSync(TargetDefinition)({
        ...base,
        architecture: {
          default: ClassicArchitecture,
          variants: [variant, variant],
        },
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(TargetDefinition)({
        ...base,
        architecture: {
          default: DddArchitecture,
          variants: [{ ...variant, id: DddArchitecture }],
        },
      }),
    ).toThrow();
  });
});
