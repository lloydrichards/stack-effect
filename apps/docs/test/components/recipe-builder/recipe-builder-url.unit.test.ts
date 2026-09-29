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

  it("round trips Deno with its own package manager", () => {
    const values = {
      ...fullStackRecipeFixture,
      config: {
        ...fullStackRecipeFixture.config,
        runtime: { _tag: "deno" as const },
        monorepo: undefined,
        lint: undefined,
        format: undefined,
      },
    };
    const encoded = encodeRecipeBuilderUrl(values);
    const decoded = decodeRecipeBuilderUrl(encoded);

    expect(encoded.get("runtime")).toBe("deno");
    expect(encoded.get("package-manager")).toBe("deno");
    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.config.runtime).toEqual({ _tag: "deno" });
    expect(decoded.initialValues.config.typescript).toBe("6");
    expect(decoded.initialValues.config.monorepo).toBeUndefined();
    expect(decoded.initialValues.config.lint).toBeUndefined();
    expect(decoded.initialValues.config.format).toBeUndefined();
  });

  it("keeps explicit Deno tooling choices in a share URL", () => {
    const values = {
      ...fullStackRecipeFixture,
      config: {
        ...fullStackRecipeFixture.config,
        runtime: { _tag: "deno" as const },
        typescript: "7" as const,
        monorepo: "vite-plus" as const,
        lint: "oxlint" as const,
        format: "oxfmt" as const,
      },
    };
    const encoded = encodeRecipeBuilderUrl(values);
    const decoded = decodeRecipeBuilderUrl(encoded);

    expect(encoded.get("typescript")).toBe("7");
    expect(encoded.get("monorepo")).toBe("vite-plus");
    expect(encoded.get("lint")).toBe("oxlint");
    expect(encoded.get("format")).toBe("oxfmt");
    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.config.typescript).toBe("7");
    expect(decoded.initialValues.config.monorepo).toBe("vite-plus");
    expect(decoded.initialValues.config.lint).toBe("oxlint");
    expect(decoded.initialValues.config.format).toBe("oxfmt");
  });

  it("infers Deno from a shared URL with only its package manager", () => {
    const decoded = decodeRecipeBuilderUrl(
      new URLSearchParams("package-manager=deno"),
    );

    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.config.runtime).toEqual({ _tag: "deno" });
  });

  it("restores explicit Deno tooling choices", () => {
    const decoded = decodeRecipeBuilderUrl(
      new URLSearchParams(
        "runtime=deno&package-manager=deno&typescript=7&monorepo=vite-plus&lint=oxlint&format=oxfmt",
      ),
    );

    expect(decoded.issue).toBeUndefined();
    expect(decoded.initialValues.config).toMatchObject({
      runtime: { _tag: "deno" },
      typescript: "7",
      monorepo: "vite-plus",
      lint: "oxlint",
      format: "oxfmt",
    });
  });

  it("rejects malformed, unknown, and conflicting shared links without a partial restore", () => {
    [
      "?target=server/api:",
      "?runtime=bun&package-manager=pnpm",
      "?runtime=deno&package-manager=npm",
      "?runtime=node&package-manager=deno",
      "?runtime=deno&package-manager=deno&monorepo=turbo",
      "?runtime=node&runtime=bun&package-manager=pnpm",
      "?target=server/api:server-http-api,server-http-api",
      "?name=demo&utm_source=newsletter",
      "?name=shared-recipe&target=workspace/shared-recipe:workspace-devenv-husky&no-git",
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

  describe("catalog parameters", () => {
    const ext = "https://ext.example.test/v1.json";
    const decode = (...catalogs: ReadonlyArray<string>) =>
      decodeRecipeBuilderUrl(
        new URLSearchParams([
          ["name", "catalog-app"],
          ...catalogs.map((value) => ["catalog", value] as [string, string]),
        ]),
      );

    it("uses the official catalog when a link names none", () => {
      const decoded = decode();

      expect(decoded.issue).toBeUndefined();
      expect(decoded.initialValues.config.catalogs).toBeUndefined();
    });

    it("stores an explicit official-only link as the default set", () => {
      const decoded = decode("official");

      expect(decoded.issue).toBeUndefined();
      expect(decoded.initialValues.config.catalogs).toBeUndefined();
      expect(
        encodeRecipeBuilderUrl(decoded.initialValues).getAll("catalog"),
      ).toEqual([]);
    });

    it("round trips a custom catalog beside the official one in order", () => {
      const decoded = decode(`ext=${ext}`, "official");

      expect(decoded.issue).toBeUndefined();
      expect(decoded.initialValues.config.catalogs).toEqual([
        { name: "ext", url: ext },
        { name: "official" },
      ]);
      expect(
        encodeRecipeBuilderUrl(decoded.initialValues).getAll("catalog"),
      ).toEqual([`ext=${ext}`, "official"]);
    });

    it("splits a catalog parameter at the first equals sign", () => {
      const url = `${ext}?channel=beta`;
      const decoded = decode("official", `ext=${url}`);

      expect(decoded.initialValues.config.catalogs).toContainEqual({
        name: "ext",
        url,
      });
    });

    it("round trips a link without the official catalog", () => {
      const decoded = decode(`ext=${ext}`);

      expect(decoded.issue).toBeUndefined();
      expect(decoded.initialValues.config.catalogs).toEqual([
        { name: "ext", url: ext },
      ]);
      expect(
        encodeRecipeBuilderUrl(decoded.initialValues).getAll("catalog"),
      ).toEqual([`ext=${ext}`]);
    });

    it("leaves official tool and Git choices out of a custom-only link", () => {
      const decoded = decode(`ext=${ext}`);
      const encoded = encodeRecipeBuilderUrl({
        ...decoded.initialValues,
        config: { ...decoded.initialValues.config, lint: "biome" },
        gitEnabled: false,
      });

      expect(encoded.has("lint")).toBe(false);
      expect(encoded.has("no-git")).toBe(false);
    });

    it.each([
      ["a bare custom name", ["official", "ext"]],
      ["an official URL", ["official=https://x.example.test/v1.json"]],
    ])(
      "should refuse the link when a catalog parameter is %s",
      (_label, catalogs) => {
        const decoded = decode(...catalogs);

        expect(decoded.issue).toMatch(/invalid catalogs/u);
      },
    );
  });
});
