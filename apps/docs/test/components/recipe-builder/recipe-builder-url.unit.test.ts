import { assert, describe, expect, it } from "@effect/vitest";
import { CustomCatalogSource } from "@repo/domain/CatalogSource";
import { Schema } from "effect";
import {
  decodeRecipeBuilderUrl,
  encodeRecipeBuilderUrl,
} from "../../../app/components/recipe-builder/recipe-builder-url";
import { toggleTargetModule } from "../../../app/components/recipe-builder/target-selector/state";
import { CatalogModule } from "../../../app/workers/recipe-builder/domain";
import {
  clientModuleFixture,
  clientTargetFixture,
  recipeCatalogFixture,
  fullStackRecipeFixture,
} from "./recipe-fixtures";

describe("recipe builder URL", () => {
  it("restores which target and module brought in a dependency", () => {
    const encoded = encodeRecipeBuilderUrl(fullStackRecipeFixture);
    const decoded = decodeRecipeBuilderUrl(encoded);

    assert.isUndefined(decoded.issue);
    // toEqual ignores the decoded `catalogs: undefined` key; assert.deepStrictEqual does not.
    expect(decoded.initialValues.config).toEqual(fullStackRecipeFixture.config);
    assert.strictEqual(
      decoded.initialValues.gitEnabled,
      fullStackRecipeFixture.gitEnabled,
    );
    assert.strictEqual(
      encodeRecipeBuilderUrl(decoded.initialValues).toString(),
      encoded.toString(),
    );
    const client = decoded.initialValues.targets.find(
      (target) => target.kind === "client-react",
    );
    expect(
      decoded.initialValues.targets.find((target) => target.kind === "server"),
    ).toMatchObject({
      addedByDependency: true,
      requirements: [
        {
          sourceTargetId: client?.id,
          sourceModuleId: "client-react-http-api",
          moduleId: "server-http-api",
          addedModule: true,
        },
      ],
    });
    assert.deepStrictEqual(decoded.initialValues.supportSelections, []);
  });

  it.each([false, true])(
    "restores same-target implications and removes only automatically added modules (already selected: %s)",
    (alreadySelected) => {
      const implied = "client-react-http-api-todos";
      const source = Schema.decodeUnknownSync(CatalogModule)({
        ...clientModuleFixture,
        implies: [{ targetKind: clientTargetFixture.kind, moduleId: implied }],
      });
      const target = {
        ...clientTargetFixture,
        modules: [
          ...clientTargetFixture.modules,
          ...(alreadySelected ? [implied] : []),
        ],
      };
      const toggle = (current: typeof clientTargetFixture) =>
        toggleTargetModule(
          [current],
          current,
          source,
          [source],
          recipeCatalogFixture,
          () => 1,
        );
      const encoded = encodeRecipeBuilderUrl({
        ...fullStackRecipeFixture,
        targets: toggle(target),
      });
      const decoded = decodeRecipeBuilderUrl(encoded);
      assert.isUndefined(decoded.issue);
      const [restored] = decoded.initialValues.targets;
      assert.isDefined(restored);
      assert.deepStrictEqual(restored.requirements, [
        {
          sourceTargetId: restored.id,
          sourceModuleId: source.id,
          moduleId: implied,
          addedModule: !alreadySelected,
        },
      ]);
      expect(toggle(restored)).toMatchObject([
        { modules: target.modules, requirements: [] },
      ]);
    },
  );

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

    assert.strictEqual(encoded.get("runtime"), "deno");
    assert.strictEqual(encoded.get("package-manager"), "deno");
    assert.isUndefined(decoded.issue);
    assert.deepStrictEqual(decoded.initialValues.config.runtime, {
      _tag: "deno",
    });
    assert.strictEqual(decoded.initialValues.config.typescript, "6");
    assert.isUndefined(decoded.initialValues.config.monorepo);
    assert.isUndefined(decoded.initialValues.config.lint);
    assert.isUndefined(decoded.initialValues.config.format);
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

    assert.strictEqual(encoded.get("typescript"), "7");
    assert.strictEqual(encoded.get("monorepo"), "vite-plus");
    assert.strictEqual(encoded.get("lint"), "oxlint");
    assert.strictEqual(encoded.get("format"), "oxfmt");
    assert.isUndefined(decoded.issue);
    assert.strictEqual(decoded.initialValues.config.typescript, "7");
    assert.strictEqual(decoded.initialValues.config.monorepo, "vite-plus");
    assert.strictEqual(decoded.initialValues.config.lint, "oxlint");
    assert.strictEqual(decoded.initialValues.config.format, "oxfmt");
  });

  it("infers Deno from a shared URL with only its package manager", () => {
    const decoded = decodeRecipeBuilderUrl(
      new URLSearchParams("package-manager=deno"),
    );

    assert.isUndefined(decoded.issue);
    assert.deepStrictEqual(decoded.initialValues.config.runtime, {
      _tag: "deno",
    });
  });

  it("restores explicit Deno tooling choices", () => {
    const decoded = decodeRecipeBuilderUrl(
      new URLSearchParams(
        "runtime=deno&package-manager=deno&typescript=7&monorepo=vite-plus&lint=oxlint&format=oxfmt",
      ),
    );

    assert.isUndefined(decoded.issue);
    assert.containSubset(decoded.initialValues.config, {
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

      assert.isDefined(decoded.issue);
      assert.deepStrictEqual(decoded.initialValues.targets, []);
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

    assert.strictEqual(params.get("name"), fullStackRecipeFixture.config.name);
    assert.isNotEmpty(params.getAll("target"));
    assert.strictEqual(params.has("runtime"), false);
    assert.strictEqual(params.has("package-manager"), false);
    assert.strictEqual(params.has("no-git"), true);
  });

  it("hydrates a valid project-name-only URL", () => {
    const decoded = decodeRecipeBuilderUrl(
      new URLSearchParams("?name=shared-recipe"),
    );

    assert.isUndefined(decoded.issue);
    assert.strictEqual(decoded.initialValues.config.name, "shared-recipe");
  });

  it("uses the default TypeScript version for Nx shared links when omitted", () => {
    const decoded = decodeRecipeBuilderUrl(
      new URLSearchParams("?name=shared-recipe&monorepo=nx"),
    );

    assert.isUndefined(decoded.issue);
    assert.strictEqual(decoded.initialValues.config.monorepo, "nx");
    assert.strictEqual(decoded.initialValues.config.typescript, "7");
  });

  it("round trips the database provider outside editable targets", () => {
    const encoded = encodeRecipeBuilderUrl({
      ...fullStackRecipeFixture,
      database: "sqlite",
    });
    const decoded = decodeRecipeBuilderUrl(encoded);

    assert.isUndefined(decoded.issue);
    assert.strictEqual(decoded.initialValues.database, "sqlite");
    assert.strictEqual(
      decoded.initialValues.targets.some(
        (target) => target.kind === "package" && target.name === "db",
      ),
      false,
    );
    assert.include(encoded.getAll("target"), "package/db:package-db-sqlite");
  });

  describe("catalog parameters", () => {
    const ext = "https://ext.example.test/v1.json";
    const extSource = Schema.decodeSync(CustomCatalogSource)({
      name: "ext",
      url: ext,
    });
    const decode = (...catalogs: ReadonlyArray<string>) =>
      decodeRecipeBuilderUrl(
        new URLSearchParams([
          ["name", "catalog-app"],
          ...catalogs.map((value) => ["catalog", value] as [string, string]),
        ]),
      );

    it("uses the official catalog when a link names none", () => {
      const decoded = decode();

      assert.isUndefined(decoded.issue);
      assert.isUndefined(decoded.initialValues.config.catalogs);
    });

    it("stores an explicit official-only link as the default set", () => {
      const decoded = decode("official");

      assert.isUndefined(decoded.issue);
      assert.isUndefined(decoded.initialValues.config.catalogs);
      assert.deepStrictEqual(
        encodeRecipeBuilderUrl(decoded.initialValues).getAll("catalog"),
        [],
      );
    });

    it("round trips a custom catalog beside the official one in order", () => {
      const decoded = decode(`ext=${ext}`, "official");

      assert.isUndefined(decoded.issue);
      assert.deepStrictEqual(decoded.initialValues.config.catalogs, [
        extSource,
        { name: "official" },
      ]);
      assert.deepStrictEqual(
        encodeRecipeBuilderUrl(decoded.initialValues).getAll("catalog"),
        [`ext=${ext}`, "official"],
      );
    });

    it("splits a catalog parameter at the first equals sign", () => {
      const url = `${ext}?channel=beta`;
      const { catalogs } = decode("official", `ext=${url}`).initialValues
        .config;

      const custom = catalogs?.find((source) => source.name === "ext");
      assert.strictEqual(
        custom && "url" in custom ? custom.url : undefined,
        url,
      );
    });

    it("round trips a link without the official catalog", () => {
      const decoded = decode(`ext=${ext}`);

      assert.isUndefined(decoded.issue);
      assert.deepStrictEqual(decoded.initialValues.config.catalogs, [
        extSource,
      ]);
      assert.deepStrictEqual(
        encodeRecipeBuilderUrl(decoded.initialValues).getAll("catalog"),
        [`ext=${ext}`],
      );
    });

    it("leaves official tool and Git choices out of a custom-only link", () => {
      const decoded = decode(`ext=${ext}`);
      const encoded = encodeRecipeBuilderUrl({
        ...decoded.initialValues,
        config: { ...decoded.initialValues.config, lint: "biome" },
        gitEnabled: false,
      });

      assert.strictEqual(encoded.has("lint"), false);
      assert.strictEqual(encoded.has("no-git"), false);
    });

    it.each([
      ["a bare custom name", ["official", "ext"]],
      ["an official URL", ["official=https://x.example.test/v1.json"]],
    ])(
      "should refuse the link when a catalog parameter is %s",
      (_label, catalogs) => {
        const decoded = decode(...catalogs);

        assert.isDefined(decoded.issue);
        assert.match(decoded.issue, /invalid catalogs/u);
      },
    );
  });
});
