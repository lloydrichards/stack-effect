import { describe, expect, it } from "vitest";
import {
  decodeRecipeBuilderUrl,
  encodeRecipeBuilderUrl,
} from "../../../app/components/recipe-builder/recipe-builder-url";
import { fullStackRecipeFixture } from "./recipe-fixtures";

describe("recipe builder URL", () => {
  it("omits default infrastructure and round trips Cloudflare canonically", () => {
    expect(
      encodeRecipeBuilderUrl(fullStackRecipeFixture).has("infrastructure"),
    ).toBe(false);
    const encoded = encodeRecipeBuilderUrl({
      ...fullStackRecipeFixture,
      config: {
        ...fullStackRecipeFixture.config,
        infrastructure: "cloudflare",
      },
    });
    expect(encoded.get("infrastructure")).toBe("cloudflare");
    const decoded = decodeRecipeBuilderUrl(encoded);
    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.config.infrastructure).toBe("cloudflare");
    expect(encodeRecipeBuilderUrl(decoded.initialValues).toString()).toBe(
      encoded.toString(),
    );
  });

  it("rejects unknown and duplicate infrastructure parameters", () => {
    [
      "?infrastructure=aws",
      "?infrastructure=none&infrastructure=cloudflare",
    ].forEach((search) =>
      expect(
        decodeRecipeBuilderUrl(new URLSearchParams(search)).issue,
      ).toBeDefined(),
    );
  });

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
});
