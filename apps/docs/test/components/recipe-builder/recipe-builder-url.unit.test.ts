import { describe, expect, it } from "vitest";
import {
  decodeRecipeBuilderUrl,
  encodeRecipeBuilderUrl,
} from "../../../app/components/recipe-builder/recipe-builder-url";
import { fullStackRecipeFixture } from "./recipe-fixtures";

describe("recipe builder URL", () => {
  it("round trips a create-compatible recipe without form bookkeeping", () => {
    const encoded = encodeRecipeBuilderUrl(fullStackRecipeFixture);
    const decoded = decodeRecipeBuilderUrl(encoded);

    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.config).toEqual(fullStackRecipeFixture.config);
    expect(decoded.initialValues.gitEnabled).toBe(
      fullStackRecipeFixture.gitEnabled,
    );
    expect(encodeRecipeBuilderUrl(decoded.initialValues).toString()).toBe(
      encoded.toString(),
    );
    expect(decoded.initialValues.supportSelections).toEqual([]);
  });

  it("rejects malformed, unknown, and conflicting shared links without a partial restore", () => {
    [
      "?target=server/api:",
      "?runtime=bun&package-manager=pnpm",
      "?runtime=node&runtime=bun&package-manager=pnpm",
      "?target=server/api:server-http-api,server-http-api",
      "?name=demo&utm_source=newsletter",
    ].forEach((search) => {
      const decoded = decodeRecipeBuilderUrl(new URLSearchParams(search));

      expect(decoded.issue).toBeDefined();
      expect(decoded.initialValues.targets).toEqual([]);
    });
  });

  it("uses create flag names and omits default configuration flags", () => {
    const params = encodeRecipeBuilderUrl({
      ...fullStackRecipeFixture,
      config: {
        ...fullStackRecipeFixture.config,
        runtime: { _tag: "bun" },
        typescript: "6",
        monorepo: "turbo",
        lint: "biome",
        format: "biome",
        test: "vitest",
      },
      gitEnabled: false,
    });

    expect(params.get("name")).toBe(fullStackRecipeFixture.config.name);
    expect(params.getAll("target")).not.toHaveLength(0);
    expect(params.has("runtime")).toBe(false);
    expect(params.has("package-manager")).toBe(false);
    expect(params.has("no-git")).toBe(true);
  });

  it("hydrates a valid project-name-only URL", () => {
    const decoded = decodeRecipeBuilderUrl(
      new URLSearchParams("?name=shared-recipe"),
    );

    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.config.name).toBe("shared-recipe");
  });

  it("uses the default TypeScript version for Nx shared links when omitted", () => {
    const decoded = decodeRecipeBuilderUrl(
      new URLSearchParams("?name=shared-recipe&monorepo=nx"),
    );

    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.config.monorepo).toBe("nx");
    expect(decoded.initialValues.config.typescript).toBe("7");
  });

  it("round trips the database provider outside editable targets", () => {
    const encoded = encodeRecipeBuilderUrl({
      ...fullStackRecipeFixture,
      database: "sqlite",
    });
    const decoded = decodeRecipeBuilderUrl(encoded);

    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.database).toBe("sqlite");
    expect(
      decoded.initialValues.targets.some(
        (target) => target.kind === "package" && target.name === "db",
      ),
    ).toBe(false);
    expect(encoded.getAll("target")).toContain("package/db:package-db-sqlite");
  });

  it("preserves the exact pre-architecture URL bytes for Classic", () => {
    const encoded = encodeRecipeBuilderUrl(fullStackRecipeFixture).toString();
    const decoded = decodeRecipeBuilderUrl(new URLSearchParams(encoded));

    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.architecture).toBe("classic");
    expect(encodeRecipeBuilderUrl(decoded.initialValues).toString()).toBe(
      encoded,
    );
    expect(encoded).not.toContain("architecture");
  });

  it("round trips all canonical additive DDD provider combinations", () => {
    for (const providers of [
      [],
      ["server-http-api-todos-provider-sqlite"],
      ["server-http-api-todos-provider-postgres"],
      [
        "server-http-api-todos-provider-postgres",
        "server-http-api-todos-provider-sqlite",
        "server-http-api-todos-provider-postgres",
      ],
    ] as const) {
      const providerSet = new Set<string>(providers);
      const expected = [
        "server-http-api-todos",
        ...(providerSet.has("server-http-api-todos-provider-sqlite")
          ? ["server-http-api-todos-provider-sqlite"]
          : []),
        ...(providerSet.has("server-http-api-todos-provider-postgres")
          ? ["server-http-api-todos-provider-postgres"]
          : []),
      ];
      const encoded = encodeRecipeBuilderUrl({
        ...fullStackRecipeFixture,
        architecture: "ddd",
        database: "none",
        targets: [
          {
            id: "ddd-api",
            kind: "server",
            name: "api",
            modules: [...providers, "server-http-api-todos"],
          },
        ],
      });
      const decoded = decodeRecipeBuilderUrl(encoded);

      expect(encoded.get("architecture")).toBe("ddd");
      expect(encoded.getAll("target")).toContain(
        `server/api:${expected.join(",")}`,
      );
      expect(decoded.issue).toBeUndefined();
      expect(decoded.initialValues.database).toBe("none");
      expect(decoded.initialValues.targets).toMatchObject([
        { kind: "server", name: "api", modules: expected },
      ]);
      expect(encodeRecipeBuilderUrl(decoded.initialValues).toString()).toBe(
        encoded.toString(),
      );
    }
    expect(
      decodeRecipeBuilderUrl(new URLSearchParams("architecture=hexagonal"))
        .issue,
    ).toBeDefined();
    expect(
      decodeRecipeBuilderUrl(
        new URLSearchParams("architecture=ddd&architecture=ddd"),
      ).issue,
    ).toBeDefined();
  });
});
