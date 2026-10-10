// Browser interaction callbacks intentionally use the async APIs exposed by Playwright and Vitest Browser Mode.
// @effect-diagnostics asyncFunction:off
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type {
  CatalogAtomRequest,
  PreviewAtomRequest,
} from "../../../app/atom/recipe-builder-atom";
import { RecipeBuilder } from "../../../app/components/recipe-builder/recipe-builder";
import { RecipeBuilderRpcFailure } from "../../../app/workers/recipe-builder/domain";

const workerCalls = vi.hoisted(() => ({
  reconcileModules: false,
  failCatalogOnce: false,
  /** A worker failure every catalog request returns until the test clears it. */
  catalogFailure: undefined as RecipeBuilderRpcFailure | undefined,
  catalogWarning: undefined as "stale" | "persistence" | undefined,
  /** Custom sources whose documents declare `requires: ["official"]`. */
  requiresOfficial: [] as Array<string>,
  deferIdentityCatalog: false,
  catalogRequests: [] as Array<CatalogAtomRequest>,
  pendingIdentityCatalogs: [] as Array<{
    interrupted: boolean;
    complete: () => void;
  }>,
  deferPreviews: false,
  pendingPreviews: [] as Array<{
    complete: () => void;
  }>,
}));

const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("~/lib/analytics", () => analytics);

vi.mock("~/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({
    status: "idle" as const,
    copy: () => Promise.resolve(true),
    reset: vi.fn(),
  }),
}));

vi.mock("../../../app/atom/recipe-builder-atom", async (importOriginal) => {
  const [original, { Effect }, { Atom }, { recipeCatalogFixture }] =
    await Promise.all([
      // The original module only builds its Worker when an atom first runs.
      importOriginal<typeof import("../../../app/atom/recipe-builder-atom")>(),
      import("effect"),
      import("effect/reactivity"),
      import("./recipe-fixtures"),
    ]);
  const previewFor = ({ input }: PreviewAtomRequest) => {
    const targets = input.recipe.targets.map(({ target, modules }) => ({
      identity: target,
      modules: modules.map((id) => ({ id })),
    }));
    const blueprintTargets = targets.map(({ identity }) => ({
      _tag: "target" as const,
      id:
        identity.kind === "workspace"
          ? "."
          : identity.kind === "package"
            ? `packages/${identity.name}`
            : `apps/${identity.kind}-${identity.name}`,
      identity,
    }));
    return {
      command: `bunx stack-effect create ${input.config.name}`,
      selection: { targets },
      blueprint: { nodes: blueprintTargets, edges: [] },
      files: [
        {
          path: "stack.effect.json",
          status: "created" as const,
          contents: `${JSON.stringify(input.config, null, 2)}\n`,
        },
      ],
    };
  };
  const sourcesFor = (sources: CatalogAtomRequest["sources"]) =>
    sources.map((source) => {
      const sourceUrl =
        "url" in source
          ? source.url
          : "https://docs.example.test/registry/v1/catalog.json";
      const warning =
        source.name === "official" ? workerCalls.catalogWarning : undefined;
      return {
        name: source.name,
        sourceUrl,
        requires: workerCalls.requiresOfficial.includes(source.name)
          ? ["official"]
          : [],
        freshness:
          warning === "stale" ? ("cached" as const) : ("current" as const),
        ...(warning === undefined
          ? {}
          : {
              warning: {
                kind: warning,
                sourceUrl,
                lastValidatedAt: 1_700_000_000_000,
                message: "Catalog cache notice",
              },
            }),
      };
    });
  return {
    recipeBuilderRpcErrorMessage: () =>
      "The preview worker stopped unexpectedly.",
    recipeBuilderRpcFailure: original.recipeBuilderRpcFailure,
    catalogAtom: Atom.fn((request: CatalogAtomRequest) =>
      Effect.suspend(() => {
        workerCalls.catalogRequests.push(request);
        if (workerCalls.catalogFailure !== undefined)
          return Effect.fail(workerCalls.catalogFailure);
        if (workerCalls.failCatalogOnce) {
          workerCalls.failCatalogOnce = false;
          return Effect.fail({
            _tag: "CatalogEnrichmentFailure",
            message: "Catalog enrichment failed.",
          });
        }
        const requestedOwners = new Set(
          request.targets.map(({ owner }) => owner.toKey()),
        );
        const requestedTargetModules = request.targets.map(({ owner }) => ({
          owner,
          modules:
            recipeCatalogFixture.targetModules.find(
              (entry) => entry.owner.toKey() === owner.toKey(),
            )?.modules ??
            recipeCatalogFixture.targetModules.find(
              (entry) => entry.owner.kind === owner.kind,
            )?.modules ??
            [],
        }));
        const catalog = {
          ...recipeCatalogFixture,
          sources: sourcesFor(request.sources),
          targetModules: workerCalls.reconcileModules
            ? request.targets.map(({ owner }) => ({
                owner,
                modules:
                  owner.kind === "client-react"
                    ? [
                        recipeCatalogFixture.targetModules[0]?.modules[0],
                      ].filter((module) => module !== undefined)
                    : (recipeCatalogFixture.targetModules.find(
                        (entry) => entry.owner.kind === owner.kind,
                      )?.modules ?? []),
              }))
            : [
                ...requestedTargetModules,
                ...recipeCatalogFixture.targetModules.filter(
                  (entry) => !requestedOwners.has(entry.owner.toKey()),
                ),
              ],
        };
        if (!workerCalls.deferIdentityCatalog)
          return Effect.succeed({ request, catalog });
        return Effect.callback((resume) => {
          const pending = {
            interrupted: false,
            complete: () => resume(Effect.succeed({ request, catalog })),
          };
          workerCalls.pendingIdentityCatalogs.push(pending);
          return Effect.sync(() => {
            pending.interrupted = true;
          });
        });
      }),
    ),
    previewAtom: Atom.fn((request: PreviewAtomRequest) =>
      Effect.suspend(() => {
        if (!workerCalls.deferPreviews) {
          return Effect.succeed({ request, preview: previewFor(request) });
        }
        return Effect.callback((resume) => {
          const pending = {
            complete: () =>
              resume(Effect.succeed({ request, preview: previewFor(request) })),
          };
          workerCalls.pendingPreviews.push(pending);
          return Effect.void;
        });
      }),
    ),
  };
});

beforeEach(() => {
  workerCalls.reconcileModules = false;
  workerCalls.failCatalogOnce = false;
  workerCalls.catalogFailure = undefined;
  workerCalls.catalogWarning = undefined;
  workerCalls.requiresOfficial = [];
  workerCalls.deferIdentityCatalog = false;
  workerCalls.catalogRequests = [];
  workerCalls.pendingIdentityCatalogs = [];
  workerCalls.deferPreviews = false;
  workerCalls.pendingPreviews = [];
  analytics.trackEvent.mockClear();
});

const renderRecipeBuilder = (initialEntry = "/builder") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RecipeBuilder />
      <RecipeBuilderLocationProbe />
    </MemoryRouter>,
  );

const extUrl = "https://ext.example.test/registry/v1/catalog.json";
/** A shared link naming the official catalog and a custom `ext` catalog. */
const sharedExtLink = `/builder?name=ext-app&catalog=official&catalog=${encodeURIComponent(`ext=${extUrl}`)}`;
/** A shared link naming only the custom `ext` catalog. */
const customOnlyLink = `/builder?name=ext-app&catalog=${encodeURIComponent(`ext=${extUrl}`)}`;
const sharedCatalogParams = () =>
  new URLSearchParams(
    page.getByLabelText("Recipe URL search").element().textContent ?? "",
  ).getAll("catalog");
const lastRequestedSources = () =>
  workerCalls.catalogRequests.at(-1)?.sources.map((source) => source.name);

function RecipeBuilderLocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <button
        type="button"
        onClick={() => navigate("/builder?name=shared-recipe")}
      >
        Load shared recipe
      </button>
      <button type="button" onClick={() => navigate("/builder")}>
        Clear shared recipe
      </button>
      <output aria-label="Recipe URL search">{location.search}</output>
    </>
  );
}

test("should leave an invalid shared recipe URL visible without previewing a fallback", async () => {
  await renderRecipeBuilder("/builder?target=server/api:");

  await expect
    .element(page.getByText("Shared recipe could not be restored"))
    .toBeVisible();
  await expect
    .element(page.getByText("Loading the recipe catalog"))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByLabelText("Recipe URL search"))
    .toHaveTextContent("?target=server/api:");
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: "Share recipe" }))
    .toBeDisabled();
});

test("should replace valid URL edits and reset the existing form for external navigation", async () => {
  await renderRecipeBuilder();

  await page.getByLabelText("Project name").fill("local-recipe");
  await expect
    .element(page.getByLabelText("Recipe URL search"))
    .toHaveTextContent("?name=local-recipe");
  await expect
    .element(page.getByLabelText("Project name"))
    .toHaveValue("local-recipe");

  await page.getByRole("button", { name: "Load shared recipe" }).click();
  await expect
    .element(page.getByLabelText("Project name"))
    .toHaveValue("shared-recipe");

  await page.getByRole("button", { name: "Clear shared recipe" }).click();
  await expect
    .element(page.getByLabelText("Project name"))
    .toHaveValue("my-effect-app");
});

test("should keep Bun selected after rapidly changing the Node package manager", async () => {
  await renderRecipeBuilder();

  const bunRuntime = page.getByRole("button", { name: "Bun" });
  const packageManager = page.getByLabelText("Package manager");
  await expect.element(bunRuntime).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Node" }).click();
  await packageManager.click();
  await page.getByRole("option", { name: "npm", exact: true }).click();
  await bunRuntime.click();

  await expect.element(bunRuntime).toHaveAttribute("aria-pressed", "true");
  await expect.element(packageManager).toBeDisabled();
  await expect.element(packageManager).toHaveTextContent("Bun");
  await expect
    .poll(() => page.getByLabelText("Recipe URL search").element().textContent)
    .not.toContain("runtime=node");
  await expect
    .poll(() => page.getByLabelText("Recipe URL search").element().textContent)
    .not.toContain("package-manager=");
});

test("should expose Deno configuration choices", async () => {
  await renderRecipeBuilder();

  await page.getByRole("button", { name: "Deno" }).click();

  await expect.element(page.getByLabelText("Package manager")).toBeDisabled();
  await expect
    .element(page.getByLabelText("Package manager"))
    .toHaveTextContent("Deno");
  await expect.element(page.getByLabelText("TypeScript")).toBeEnabled();
  await expect
    .element(page.getByLabelText("TypeScript"))
    .toHaveTextContent("TypeScript 6");
  await expect.element(page.getByLabelText("Monorepo")).toBeEnabled();
  await page.getByLabelText("Monorepo").click();
  await expect
    .element(
      page.getByRole("option", {
        name: "Turborepo (unavailable with deno)",
      }),
    )
    .toBeDisabled();
  await expect.element(page.getByLabelText("Lint")).toBeEnabled();
  await expect.element(page.getByLabelText("Format")).toBeEnabled();
  await expect
    .poll(() => page.getByLabelText("Recipe URL search").element().textContent)
    .toContain("runtime=deno");
});

test("should clear Turbo when switching a recipe to Deno", async () => {
  await renderRecipeBuilder();

  await page.getByLabelText("Monorepo").click();
  await page.getByRole("option", { name: "Turborepo" }).click();
  await expect
    .element(page.getByLabelText("Monorepo"))
    .toHaveTextContent("Turborepo");

  await page.getByRole("button", { name: "Deno" }).click();

  await expect
    .element(page.getByLabelText("Monorepo"))
    .toHaveTextContent("None");
  await expect
    .poll(() => page.getByLabelText("Recipe URL search").element().textContent)
    .not.toContain("monorepo=turbo");
});

test("should disable and clear Husky when Git is turned off", async () => {
  await renderRecipeBuilder();

  const git = page.getByRole("button", { name: /^Git/u });
  const husky = page.getByRole("button", {
    name: /^Husky \+ lint-stagedRun staged-file format and lint tasks before each commit$/u,
  });

  await expect.element(husky).toBeEnabled();
  await husky.click();
  await expect.element(husky).toHaveAttribute("aria-pressed", "true");

  await git.click();

  await expect.element(husky).toBeDisabled();
  await expect.element(husky).toHaveAttribute("aria-pressed", "false");
});

test("should generate a usable preview when the user completes a valid Selection", async () => {
  await renderRecipeBuilder();

  await page.getByRole("button", { name: "Client React Application" }).click();
  await page.getByLabelText("Target name").fill("sdk/web");
  await page.getByText("HTTP API Client", { exact: true }).click();

  await expect
    .poll(() =>
      new URLSearchParams(
        page.getByLabelText("Recipe URL search").element().textContent ?? "",
      ).getAll("target"),
    )
    .toContain(
      "client-react/sdk/web:config-typescript-vite,client-react-http-api",
    );
  await expect
    .element(page.getByText("3 resolved targets").first())
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: /api · server/u }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeEnabled();
});

test("should require a database before selecting a database-backed module", async () => {
  await renderRecipeBuilder();

  await page.getByRole("button", { name: "Client React Application" }).click();
  const todoModule = page.getByRole("checkbox", { name: /Todo HTTP Client/u });

  await expect.element(todoModule).toBeDisabled();
  await expect
    .element(page.getByText("Select a database to enable this module."))
    .toBeVisible();

  await page.getByRole("button", { name: "SQLite" }).click();
  await expect.element(todoModule).toBeEnabled();
  await page.getByText("Todo HTTP Client", { exact: true }).click();

  await expect
    .element(page.getByRole("button", { name: "None" }))
    .toBeDisabled();
  await expect
    .element(page.getByText("Remove Todo HTTP Client to choose None."))
    .toBeVisible();
  const selectedTargets = () =>
    new URLSearchParams(
      page.getByLabelText("Recipe URL search").element().textContent ?? "",
    ).getAll("target");
  await expect.poll(selectedTargets).toContain("package/db:package-db-sqlite");

  await page.getByRole("button", { name: "Postgres" }).click();
  await expect
    .poll(selectedTargets)
    .toContain("package/db:package-db-postgres");
  await expect
    .poll(selectedTargets)
    .not.toContain("package/db:package-db-sqlite");
});

test("should name only the source module after restoring an implied database recipe", async () => {
  await renderRecipeBuilder(
    "/builder?name=shared&target=client-react%2Fweb%3Aconfig-typescript-vite%2Cclient-react-http-api-todos&target=package%2Fdb%3Apackage-db-sqlite&target=server%2Fapi%3Aserver-http-api-todos",
  );

  await expect
    .element(page.getByText("Remove Todo HTTP Client to choose None."))
    .toBeVisible();
  await expect
    .element(page.getByText(/Todo HTTP Client and Todo HTTP API/u))
    .not.toBeInTheDocument();
});

test("should log a share after copying a valid recipe link", async () => {
  await renderRecipeBuilder();

  await expect
    .element(page.getByRole("button", { name: "Share recipe" }))
    .toBeEnabled();
  await page.getByRole("button", { name: "Share recipe" }).click();

  await vi.waitFor(() => {
    expect(analytics.trackEvent).toHaveBeenCalledWith("recipe-shared", {
      selected_target_count: 0,
      resolved_target_count: 1,
      selected_module_count: 0,
      runtime: "bun",
      package_manager: "bun",
      file_count: 1,
    });
  });
});

test("should remove unsupported modules when a renamed target resolves a different catalog", async () => {
  await renderRecipeBuilder();

  await page.getByRole("button", { name: "Client React Application" }).click();
  await page.getByText("HTTP API Client", { exact: true }).click();
  await expect
    .element(page.getByRole("tab", { name: /api · server/u }))
    .toBeVisible();

  workerCalls.reconcileModules = true;
  await page.getByLabelText("Target name").fill("renamed-web");
  await expect
    .element(page.getByText(/could not be resolved in the current catalog/u))
    .toBeVisible();
  await expect
    .element(page.getByText("HTTP API Client", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .poll(() => page.getByLabelText("Recipe URL search").element().textContent)
    .not.toContain("client-react-http-api");
});

test("should disclose an unresolved module from a shared recipe", async () => {
  await renderRecipeBuilder(
    "/builder?target=client-react%2Fweb%3Amissing-module",
  );

  await expect.element(page.getByText(/missing-module/u)).toBeVisible();
  await expect
    .element(page.getByText(/could not be resolved in the current catalog/u))
    .toBeVisible();
});

test("should reconcile a rename after its delayed catalog request completes", async () => {
  await renderRecipeBuilder();

  await page.getByRole("button", { name: "Client React Application" }).click();
  await page.getByText("HTTP API Client", { exact: true }).click();
  await expect
    .element(page.getByRole("tab", { name: /api · server/u }))
    .toBeVisible();

  workerCalls.reconcileModules = true;
  workerCalls.deferIdentityCatalog = true;
  await page.getByLabelText("Target name").fill("renamed-web");
  await expect.poll(() => workerCalls.pendingIdentityCatalogs.length).toBe(1);
  await expect
    .element(page.getByText("HTTP API Client", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("Domain API", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("Loading options…"))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByText("No modules support this target identity"))
    .not.toBeInTheDocument();

  const pendingIdentity = workerCalls.pendingIdentityCatalogs[0];
  expect(pendingIdentity?.interrupted).toBe(false);

  workerCalls.deferIdentityCatalog = false;
  pendingIdentity?.complete();

  await expect
    .element(page.getByText(/could not be resolved in the current catalog/u))
    .toBeVisible();
  expect(pendingIdentity?.interrupted).toBe(false);
});

test("should retain modules when a duplicate target name becomes unique", async () => {
  await renderRecipeBuilder();

  await page.getByRole("button", { name: "Client React Application" }).click();
  await expect
    .element(page.getByText("HTTP API Client", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Add target" }).click();
  await page.getByRole("button", { name: "Client React Application" }).click();
  await page.getByRole("tab", { name: "web · client-react" }).click();

  const requestCount = workerCalls.catalogRequests.length;
  await page.getByLabelText("Target name").fill("web-2");
  await expect
    .poll(() => workerCalls.catalogRequests.length)
    .toBeGreaterThan(requestCount);
  await expect
    .element(
      page.getByText("Target names must be unique within a target kind."),
    )
    .toBeVisible();

  workerCalls.deferIdentityCatalog = true;
  await page.getByLabelText("Target name").fill("renamed-web");
  await expect.poll(() => workerCalls.pendingIdentityCatalogs.length).toBe(1);
  await expect
    .element(page.getByText("HTTP API Client", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("No modules support this target identity"))
    .not.toBeInTheDocument();
});

test("should disable stale modules when renamed catalog resolution fails", async () => {
  await renderRecipeBuilder();

  await page.getByRole("button", { name: "Client React Application" }).click();
  workerCalls.failCatalogOnce = true;
  await page.getByLabelText("Target name").fill("renamed-web");

  await expect
    .element(page.getByRole("button", { name: "Retry options" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("checkbox", { name: /HTTP API Client/u }))
    .toBeDisabled();
  await expect
    .element(page.getByText("HTTP API Client", { exact: true }))
    .toBeVisible();
});

test("should generate a usable preview when the selected target has no modules", async () => {
  await renderRecipeBuilder();

  await page.getByRole("button", { name: "MCP Server Application" }).click();

  await expect
    .element(page.getByRole("tab", { name: "server-mcp" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeEnabled();
  await expect
    .element(page.getByLabelText("Command to run locally"))
    .toHaveTextContent("bunx stack-effect create my-effect-app");
});

test("should hold previews until a retry succeeds when the catalog load failed", async () => {
  workerCalls.failCatalogOnce = true;
  await renderRecipeBuilder();

  await expect
    .element(page.getByRole("button", { name: "Retry options" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: "Retry catalog" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Preview could not be generated"))
    .not.toBeInTheDocument();

  await page.getByRole("button", { name: "Retry catalog" }).click();

  await expect
    .element(page.getByRole("button", { name: "Retry catalog" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeEnabled();
});

test("should wait for the catalog before enabling the preview", async () => {
  workerCalls.deferIdentityCatalog = true;
  await renderRecipeBuilder();

  await expect
    .element(page.getByText("Loading the recipe catalog"))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeDisabled();
  await expect.poll(() => workerCalls.pendingIdentityCatalogs.length).toBe(1);
  workerCalls.pendingIdentityCatalogs[0]?.complete();

  await expect.element(page.getByText("Current catalog")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeEnabled();
});

test("should keep previews usable when the official catalog is served from cache", async () => {
  workerCalls.catalogWarning = "stale";
  await renderRecipeBuilder();

  await expect
    .element(page.getByText("Using cached catalog official"))
    .toBeVisible();
  await expect
    .element(page.getByText(/docs.example.test\/registry\/v1\/catalog.json/u))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeEnabled();
});

test("should clear the cached-catalog notice when a retried catalog load is current", async () => {
  workerCalls.catalogWarning = "stale";
  await renderRecipeBuilder();
  await expect
    .element(page.getByText("Using cached catalog official"))
    .toBeVisible();

  workerCalls.catalogWarning = undefined;
  await page.getByRole("button", { name: "Retry catalog" }).click();

  await expect.element(page.getByText("Current catalog")).toBeVisible();
  await expect
    .element(page.getByText("Using cached catalog official"))
    .not.toBeInTheDocument();
});

test("should keep a current preview usable when browser storage fails", async () => {
  workerCalls.catalogWarning = "persistence";
  await renderRecipeBuilder();

  await expect
    .element(page.getByText("Catalog official could not be saved"))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeEnabled();
});

test("should retain the last valid preview when the current Selection becomes invalid", async () => {
  await renderRecipeBuilder();

  const command = page.getByLabelText("Command to run locally");
  await expect
    .element(command)
    .toHaveTextContent("bunx stack-effect create my-effect-app");

  await page.getByRole("button", { name: "Client React Application" }).click();
  await page.getByLabelText("Target name").fill("sdk//web");

  await expect.element(page.getByText("1 file", { exact: true })).toBeVisible();
  await expect
    .element(command)
    .toHaveTextContent(
      "Complete every target configuration to generate a command",
    );
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeDisabled();
});

test("should show the newest preview when an older request completes after it is superseded", async () => {
  await renderRecipeBuilder();

  workerCalls.deferPreviews = true;

  await page.getByLabelText("Project name").fill("first-name");
  await expect.poll(() => workerCalls.pendingPreviews.length).toBe(1);
  await page.getByLabelText("Project name").fill("second-name");
  await expect.poll(() => workerCalls.pendingPreviews.length).toBe(2);

  workerCalls.pendingPreviews[0]?.complete();
  await expect
    .element(page.getByLabelText("Command to run locally"))
    .toHaveTextContent("Generating command…");

  workerCalls.pendingPreviews[1]?.complete();
  await expect
    .element(page.getByLabelText("Command to run locally"))
    .toHaveTextContent("bunx stack-effect create second-name");
});

test("should ask before loading when a shared link names a custom catalog", async () => {
  await renderRecipeBuilder(sharedExtLink);

  await expect
    .element(page.getByText("Load catalogs from this link?"))
    .toBeVisible();
  await expect.element(page.getByText(`ext · ${extUrl}`)).toBeVisible();
  expect(workerCalls.catalogRequests).toHaveLength(0);

  await page.getByRole("button", { name: "Load these catalogs" }).click();

  await expect.poll(lastRequestedSources).toEqual(["official", "ext"]);
  await expect.element(page.getByText("2 current catalogs")).toBeVisible();
  await expect.poll(sharedCatalogParams).toEqual(["official", `ext=${extUrl}`]);
});

test("should start over with the official catalog when a visitor declines", async () => {
  await renderRecipeBuilder(sharedExtLink);

  await page
    .getByRole("button", { name: "Start with the official catalog" })
    .click();

  await expect.poll(lastRequestedSources).toEqual(["official"]);
  expect(
    workerCalls.catalogRequests.some((request) =>
      request.sources.some((source) => source.name === "ext"),
    ),
  ).toBe(false);
  await expect.poll(sharedCatalogParams).toEqual([]);
});

test("should load a shared link without the official catalog", async () => {
  await renderRecipeBuilder(customOnlyLink);
  await page.getByRole("button", { name: "Load these catalogs" }).click();

  await expect.poll(lastRequestedSources).toEqual(["ext"]);
  await expect
    .element(page.getByText(/Tool and repository options come from/u))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: /^Database/u }))
    .not.toBeInTheDocument();
  await expect.poll(sharedCatalogParams).toEqual([`ext=${extUrl}`]);
});

test("should request the remaining catalogs when the official catalog is removed and added back", async () => {
  await renderRecipeBuilder(sharedExtLink);
  await page.getByRole("button", { name: "Load these catalogs" }).click();
  await expect.poll(lastRequestedSources).toEqual(["official", "ext"]);

  await page.getByRole("button", { name: "Remove catalog official" }).click();
  await expect.poll(lastRequestedSources).toEqual(["ext"]);
  await expect.poll(sharedCatalogParams).toEqual([`ext=${extUrl}`]);

  await page.getByRole("button", { name: "Add catalog official" }).click();
  await expect.poll(lastRequestedSources).toEqual(["official", "ext"]);
});

test("should prevent removing the last catalog when only one remains", async () => {
  await renderRecipeBuilder(customOnlyLink);
  await page.getByRole("button", { name: "Load these catalogs" }).click();
  await expect.poll(lastRequestedSources).toEqual(["ext"]);

  await expect
    .element(page.getByRole("button", { name: "Remove catalog ext" }))
    .toBeDisabled();
});

test("should keep the official catalog while a selected catalog requires it", async () => {
  workerCalls.requiresOfficial = ["ext"];
  await renderRecipeBuilder(sharedExtLink);
  await page.getByRole("button", { name: "Load these catalogs" }).click();
  await expect.element(page.getByText("2 current catalogs")).toBeVisible();

  await expect
    .element(page.getByRole("button", { name: "Remove catalog official" }))
    .toBeDisabled();
  await expect
    .element(page.getByText(/stays selected because ext requires it/u))
    .toBeVisible();
});

test("should offer the official catalog when a selected catalog requires it", async () => {
  workerCalls.requiresOfficial = ["ext"];
  workerCalls.catalogFailure = new RecipeBuilderRpcFailure({
    message: "Selected catalogs do not compose.",
    issues: [
      {
        code: "missing-source",
        message:
          "Source ext requires the official catalog, which is not selected; select it with --catalog official",
      },
    ],
    sources: [
      {
        name: "ext",
        sourceUrl: extUrl,
        requires: ["official"],
        freshness: "current",
      },
    ],
  });
  await renderRecipeBuilder(customOnlyLink);
  await page.getByRole("button", { name: "Load these catalogs" }).click();

  await expect
    .element(page.getByText("Selected catalogs do not combine"))
    .toBeVisible();
  workerCalls.catalogFailure = undefined;
  await page.getByRole("button", { name: "Add the official catalog" }).click();

  await expect.poll(lastRequestedSources).toEqual(["official", "ext"]);
  await expect.element(page.getByText("2 current catalogs")).toBeVisible();
});

test("should load the catalog without asking again when the visitor adds it", async () => {
  await renderRecipeBuilder();
  await page.getByRole("button", { name: /^Catalogs/u }).click();

  await page.getByLabelText("Catalog name").fill("ext");
  await page.getByLabelText("Catalog URL").fill(extUrl);
  await page.getByRole("button", { name: "Add catalog" }).click();

  await expect.poll(lastRequestedSources).toEqual(["official", "ext"]);
  await expect
    .element(page.getByText("Load catalogs from this link?"))
    .not.toBeInTheDocument();
  await expect.poll(sharedCatalogParams).toEqual(["official", `ext=${extUrl}`]);

  await page.getByRole("button", { name: "Remove catalog ext" }).click();
  await expect.poll(lastRequestedSources).toEqual(["official"]);
});

test("should reject an invalid catalog entry without changing the selection", async () => {
  await renderRecipeBuilder();
  const requests = workerCalls.catalogRequests.length;
  await page.getByRole("button", { name: /^Catalogs/u }).click();

  await page.getByLabelText("Catalog name").fill("ext");
  await page
    .getByLabelText("Catalog URL")
    .fill("http://ext.example.test/v1.json");
  await page.getByRole("button", { name: "Add catalog" }).click();

  await expect.element(page.getByText(/an https URL/u)).toBeVisible();
  expect(
    workerCalls.catalogRequests
      .slice(requests)
      .some((request) => request.sources.length > 1),
  ).toBe(false);
});

test("should name the catalog that failed to load when a custom catalog is unavailable", async () => {
  workerCalls.catalogFailure = new RecipeBuilderRpcFailure({
    message: `Catalog source ext: Could not fetch catalog from ${extUrl}.`,
    failedSource: { name: "ext", sourceUrl: extUrl },
  });
  await renderRecipeBuilder(sharedExtLink);
  await page.getByRole("button", { name: "Load these catalogs" }).click();

  await expect.element(page.getByText("Catalog ext unavailable")).toBeVisible();
  await expect
    .element(
      page
        .getByRole("list", { name: "Selected catalogs" })
        .getByRole("listitem")
        .filter({ hasText: extUrl })
        .getByText("Failed"),
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeDisabled();
});
