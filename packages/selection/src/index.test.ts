import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { getTargetIdentity, parseSelection, resolveBlueprint } from "./index";

describe("parseSelection", () => {
  it("accepts explicit targets with nested target modules and repo modules", () => {
    const result = parseSelection({
      targets: [
        { targetId: "app/server", targetModules: [] },
        {
          targetId: "package/domain",
          targetModules: [{ moduleId: "domain-api" }],
        },
      ],
      repoModules: ["root-bootstrap", "tooling/biome"],
    });

    expect(result).toEqual(
      Option.some({
        targets: [
          { targetId: "app/server", targetModules: [] },
          {
            targetId: "package/domain",
            targetModules: [{ moduleId: "domain-api" }],
          },
        ],
        repoModules: ["root-bootstrap", "tooling/biome"],
      }),
    );
  });

  it("accepts repo-only requests", () => {
    const result = parseSelection({
      targets: [],
      repoModules: ["root-bootstrap"],
    });

    expect(result).toEqual(
      Option.some({
        targets: [],
        repoModules: ["root-bootstrap"],
      }),
    );
  });

  it("maps v1 target ids to stable conceptual identities", () => {
    const result = getTargetIdentity({ targetId: "app/server" });

    expect(result).toEqual(
      Option.some({
        kind: "app",
        name: "server",
      }),
    );
  });

  it("rejects colliding targets independent of input ordering", () => {
    const firstResult = parseSelection({
      targets: [
        { targetId: "app/server", targetModules: [] },
        { targetId: "app/server", targetModules: [] },
      ],
      repoModules: ["root-bootstrap"],
    });

    const secondResult = parseSelection({
      targets: [
        { targetId: "app/server", targetModules: [] },
        { targetId: "package/domain", targetModules: [] },
        { targetId: "app/server", targetModules: [] },
      ],
      repoModules: ["root-bootstrap"],
    });

    expect(firstResult).toEqual(Option.none());
    expect(secondResult).toEqual(Option.none());
  });

  it("normalizes duplicate repo modules and nested target modules into a stable explicit request", () => {
    const result = parseSelection({
      targets: [
        {
          targetId: "package/domain",
          targetModules: [{ moduleId: "domain-api" }, { moduleId: "domain-api" }],
        },
      ],
      repoModules: ["tooling/biome", "root-bootstrap", "tooling/biome"],
    });

    expect(result).toEqual(
      Option.some({
        targets: [
          {
            targetId: "package/domain",
            targetModules: [{ moduleId: "domain-api" }],
          },
        ],
        repoModules: ["root-bootstrap", "tooling/biome"],
      }),
    );
  });

  it("rejects unsupported nested target-module combinations", () => {
    const invalidSelections = [
      {
        targets: [{ targetId: "app/server", targetModules: [{ moduleId: "domain-api" }] }],
        repoModules: [],
      },
      {
        targets: [{ targetId: "package/observability", targetModules: [{ moduleId: "domain-api" }] }],
        repoModules: [],
      },
    ];

    for (const invalidSelection of invalidSelections) {
      const result = parseSelection(invalidSelection);

      expect(result).toEqual(Option.none());
    }
  });

  it("rejects invalid shapes through the public validation surface", () => {
    const invalidSelections = [
      {},
      { targets: [{ targetId: "app/server", targetModules: [] }] },
      { targets: [], repoModules: [] },
      { targets: [{ targetId: "", targetModules: [] }], repoModules: ["root-bootstrap"] },
      { targets: [{ targetId: "  app/server  ", targetModules: [] }], repoModules: ["root-bootstrap"] },
      { targets: [{ targetId: "server", targetModules: [] }], repoModules: ["root-bootstrap"] },
      { targets: [{ targetId: "tool/server/api", targetModules: [] }], repoModules: ["root-bootstrap"] },
      { targets: [{ targetId: "cli/server", targetModules: [] }], repoModules: ["root-bootstrap"] },
      { targets: [{ targetId: "app/", targetModules: [] }], repoModules: ["root-bootstrap"] },
      { targets: ["app/server"], repoModules: ["root-bootstrap"] },
      { targets: [], repoModules: [""] },
      { targets: [], repoModules: ["  root-bootstrap  "] },
      {
        targets: [{ targetId: "package/domain", targetModules: [{ moduleId: "root-bootstrap" }] }],
        repoModules: [],
      },
      {
        targets: [{ targetId: "package/domain" }],
        repoModules: [],
      },
    ];

    for (const invalidSelection of invalidSelections) {
      const result = parseSelection(invalidSelection);

      expect(Option.isNone(result)).toBe(true);
    }
  });
});

describe("resolveBlueprint", () => {
  it("nests resolved target modules under their owning target while preserving resolver behavior", () => {
    const selection = parseSelection({
      targets: [
        { targetId: "app/server", targetModules: [] },
        { targetId: "package/domain", targetModules: [] },
      ],
      repoModules: ["tooling/biome", "root-bootstrap"],
    });

    if (Option.isNone(selection)) {
      throw new Error("expected selection to parse");
    }

    const result = resolveBlueprint(selection.value);

    expect(result).toEqual({
      _tag: "success",
      blueprint: {
        targets: [
          {
            targetId: "app/server",
            identity: {
              kind: "app",
              name: "server",
            },
            status: "selected",
            causes: [
              {
                _tag: "selection",
                source: {
                  _tag: "target",
                  targetId: "app/server",
                },
              },
            ],
            targetModules: [],
            composition: undefined,
          },
          {
            targetId: "package/domain",
            identity: {
              kind: "package",
              name: "domain",
            },
            status: "selected",
            causes: [
              {
                _tag: "dependency",
                edgeId:
                  "required-owning-target=>target-module:package/domain:domain-api=>target:package/domain",
              },
              {
                _tag: "selection",
                source: {
                  _tag: "target",
                  targetId: "package/domain",
                },
              },
            ],
            targetModules: [
              {
                moduleId: "domain-api",
                status: "implied",
                causes: [
                  {
                    _tag: "dependency",
                    edgeId:
                      "required-target-module=>target:app/server=>target-module:package/domain:domain-api",
                  },
                ],
              },
            ],
            composition: {
              _tag: "package",
              publicEntrypoint: "./Api",
            },
          },
        ],
        repoModules: [
          {
            moduleId: "root-bootstrap",
            status: "selected",
            causes: [
              {
                _tag: "dependency",
                edgeId:
                  "required-repo-module=>target:app/server=>repo-module:root-bootstrap",
              },
              {
                _tag: "dependency",
                edgeId:
                  "required-repo-module=>target:package/domain=>repo-module:root-bootstrap",
              },
              {
                _tag: "selection",
                source: {
                  _tag: "repo-module",
                  moduleId: "root-bootstrap",
                },
              },
            ],
          },
          {
            moduleId: "tooling/biome",
            status: "selected",
            causes: [
              {
                _tag: "selection",
                source: {
                  _tag: "repo-module",
                  moduleId: "tooling/biome",
                },
              },
            ],
          },
        ],
        edges: [
          {
            _tag: "depends-on",
            edgeId:
              "required-owning-target=>target-module:package/domain:domain-api=>target:package/domain",
            from: {
              _tag: "target-module",
              moduleId: "domain-api",
              targetId: "package/domain",
            },
            to: {
              _tag: "target",
              targetId: "package/domain",
            },
            reason: "required-owning-target",
          },
          {
            _tag: "depends-on",
            edgeId:
              "required-repo-module=>target:app/server=>repo-module:root-bootstrap",
            from: {
              _tag: "target",
              targetId: "app/server",
            },
            to: {
              _tag: "repo-module",
              moduleId: "root-bootstrap",
            },
            reason: "required-repo-module",
          },
          {
            _tag: "depends-on",
            edgeId:
              "required-repo-module=>target:package/domain=>repo-module:root-bootstrap",
            from: {
              _tag: "target",
              targetId: "package/domain",
            },
            to: {
              _tag: "repo-module",
              moduleId: "root-bootstrap",
            },
            reason: "required-repo-module",
          },
          {
            _tag: "depends-on",
            edgeId:
              "required-target-module=>target:app/server=>target-module:package/domain:domain-api",
            from: {
              _tag: "target",
              targetId: "app/server",
            },
            to: {
              _tag: "target-module",
              moduleId: "domain-api",
              targetId: "package/domain",
            },
            reason: "required-target-module",
          },
        ],
        warnings: [
          {
            _tag: "RedundantSelectionNormalized",
            edgeIds: [
              "required-repo-module=>target:app/server=>repo-module:root-bootstrap",
              "required-repo-module=>target:package/domain=>repo-module:root-bootstrap",
            ],
            node: {
              _tag: "repo-module",
              moduleId: "root-bootstrap",
            },
          },
          {
            _tag: "RedundantSelectionNormalized",
            edgeIds: [
              "required-owning-target=>target-module:package/domain:domain-api=>target:package/domain",
            ],
            node: {
              _tag: "target",
              targetId: "package/domain",
            },
          },
        ],
      },
    });
  });

  it("keeps explicitly selected nested target modules selected", () => {
    const selection = parseSelection({
      targets: [
        {
          targetId: "package/domain",
          targetModules: [{ moduleId: "domain-api" }],
        },
      ],
      repoModules: [],
    });

    if (Option.isNone(selection)) {
      throw new Error("expected selection to parse");
    }

    const result = resolveBlueprint(selection.value);

    expect(result._tag).toBe("success");

    if (result._tag !== "success") {
      throw new Error("expected blueprint to resolve");
    }

    expect(result.blueprint.targets).toEqual([
      {
        targetId: "package/domain",
        identity: {
          kind: "package",
          name: "domain",
        },
        status: "selected",
        causes: [
          {
            _tag: "dependency",
            edgeId:
              "required-owning-target=>target-module:package/domain:domain-api=>target:package/domain",
          },
          {
            _tag: "selection",
            source: {
              _tag: "target",
              targetId: "package/domain",
            },
          },
        ],
        targetModules: [
          {
            moduleId: "domain-api",
            status: "selected",
            causes: [
              {
                _tag: "selection",
                source: {
                  _tag: "target-module",
                  targetId: "package/domain",
                  moduleId: "domain-api",
                },
              },
            ],
          },
        ],
        composition: {
          _tag: "package",
          publicEntrypoint: "./Api",
        },
      },
    ]);
    expect(result.blueprint.repoModules).toEqual([
      {
        moduleId: "root-bootstrap",
        status: "implied",
        causes: [
          {
            _tag: "dependency",
            edgeId:
              "required-repo-module=>target:package/domain=>repo-module:root-bootstrap",
          },
        ],
      },
    ]);
  });

  it("still fails when a nested target module targets an invalid identity", () => {
    const result = resolveBlueprint({
      targets: [
        {
          targetId: "cli/server",
          targetModules: [{ moduleId: "domain-api" }],
        },
      ],
      repoModules: [],
    });

    expect(result).toEqual({
      _tag: "failure",
      error: {
        _tag: "InvalidTarget",
        targetId: "cli/server",
      },
    });
  });

  it("emits structured warnings while normalizing duplicate nested selections", () => {
    const result = resolveBlueprint({
      targets: [
        { targetId: "app/server", targetModules: [] },
        { targetId: "app/server", targetModules: [] },
        {
          targetId: "package/domain",
          targetModules: [{ moduleId: "domain-api" }, { moduleId: "domain-api" }],
        },
      ],
      repoModules: ["root-bootstrap", "root-bootstrap"],
    });

    expect(result._tag).toBe("success");

    if (result._tag !== "success") {
      throw new Error("expected blueprint to resolve");
    }

    expect(result.blueprint.targets).toEqual([
      {
        targetId: "app/server",
        identity: {
          kind: "app",
          name: "server",
        },
        status: "selected",
        causes: [
          {
            _tag: "selection",
            source: {
              _tag: "target",
              targetId: "app/server",
            },
          },
        ],
        targetModules: [],
        composition: undefined,
      },
      {
        targetId: "package/domain",
        identity: {
          kind: "package",
          name: "domain",
        },
        status: "selected",
        causes: [
          {
            _tag: "dependency",
            edgeId:
              "required-owning-target=>target-module:package/domain:domain-api=>target:package/domain",
          },
          {
            _tag: "selection",
            source: {
              _tag: "target",
              targetId: "package/domain",
            },
          },
        ],
        targetModules: [
          {
            moduleId: "domain-api",
            status: "selected",
            causes: [
              {
                _tag: "dependency",
                edgeId:
                  "required-target-module=>target:app/server=>target-module:package/domain:domain-api",
              },
              {
                _tag: "selection",
                source: {
                  _tag: "target-module",
                  targetId: "package/domain",
                  moduleId: "domain-api",
                },
              },
            ],
          },
        ],
        composition: {
          _tag: "package",
          publicEntrypoint: "./Api",
        },
      },
    ]);
    expect(result.blueprint.warnings).toEqual([
      {
        _tag: "DuplicateSelectionNormalized",
        node: {
          _tag: "repo-module",
          moduleId: "root-bootstrap",
        },
      },
      {
        _tag: "DuplicateSelectionNormalized",
        node: {
          _tag: "target-module",
          targetId: "package/domain",
          moduleId: "domain-api",
        },
      },
      {
        _tag: "DuplicateSelectionNormalized",
        node: {
          _tag: "target",
          targetId: "app/server",
        },
      },
      {
        _tag: "RedundantSelectionNormalized",
        edgeIds: [
          "required-repo-module=>target:app/server=>repo-module:root-bootstrap",
          "required-repo-module=>target:package/domain=>repo-module:root-bootstrap",
        ],
        node: {
          _tag: "repo-module",
          moduleId: "root-bootstrap",
        },
      },
      {
        _tag: "RedundantSelectionNormalized",
        edgeIds: [
          "required-target-module=>target:app/server=>target-module:package/domain:domain-api",
        ],
        node: {
          _tag: "target-module",
          targetId: "package/domain",
          moduleId: "domain-api",
        },
      },
      {
        _tag: "RedundantSelectionNormalized",
        edgeIds: [
          "required-owning-target=>target-module:package/domain:domain-api=>target:package/domain",
        ],
        node: {
          _tag: "target",
          targetId: "package/domain",
        },
      },
    ]);
  });

  it("keeps package composition override behavior without exposing override intents", () => {
    const selection = parseSelection({
      targets: [
        {
          targetId: "package/domain",
          targetModules: [{ moduleId: "domain-api" }],
        },
      ],
      repoModules: [],
    });

    if (Option.isNone(selection)) {
      throw new Error("expected selection to parse");
    }

    const result = resolveBlueprint(selection.value);

    expect(result._tag).toBe("success");

    if (result._tag !== "success") {
      throw new Error("expected blueprint to resolve");
    }

    expect(result.blueprint.targets[0]?.composition).toEqual({
      _tag: "package",
      publicEntrypoint: "./Api",
    });
    expect(result.blueprint.edges).toEqual([
      {
        _tag: "depends-on",
        edgeId:
          "required-owning-target=>target-module:package/domain:domain-api=>target:package/domain",
        from: {
          _tag: "target-module",
          targetId: "package/domain",
          moduleId: "domain-api",
        },
        to: {
          _tag: "target",
          targetId: "package/domain",
        },
        reason: "required-owning-target",
      },
      {
        _tag: "depends-on",
        edgeId:
          "required-repo-module=>target:package/domain=>repo-module:root-bootstrap",
        from: {
          _tag: "target",
          targetId: "package/domain",
        },
        to: {
          _tag: "repo-module",
          moduleId: "root-bootstrap",
        },
        reason: "required-repo-module",
      },
    ]);
    expect(JSON.stringify(result.blueprint)).not.toContain("override");
  });
});
