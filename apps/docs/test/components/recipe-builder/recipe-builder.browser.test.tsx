import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type {
  CatalogAtomRequest,
  PreviewAtomRequest,
} from "../../../app/atom/recipe-builder-atom";
import { RecipeBuilder } from "../../../app/components/recipe-builder/recipe-builder";

const workerCalls = vi.hoisted(() => ({
  reconcileModules: false,
  failCatalogOnce: false,
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

vi.mock("../../../app/atom/recipe-builder-atom", async () => {
  const [{ Effect }, { Atom }, { recipeCatalogFixture }] = await Promise.all([
    import("effect"),
    import("effect/unstable/reactivity"),
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
  return {
    recipeBuilderRpcErrorMessage: () =>
      "The preview worker stopped unexpectedly.",
    catalogAtom: Atom.fn((request: CatalogAtomRequest) =>
      Effect.suspend(() => {
        workerCalls.catalogRequests.push(request);
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
    .element(page.getByLabelText("Recipe URL search"))
    .not.toHaveTextContent("runtime=node");
  await expect
    .element(page.getByLabelText("Recipe URL search"))
    .not.toHaveTextContent("package-manager=");
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
  await page.getByText("HTTP API Client", { exact: true }).click();

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
  await expect
    .element(page.getByLabelText("Recipe URL search"))
    .toHaveTextContent("package%2Fdb%3Apackage-db-sqlite");

  await page.getByRole("button", { name: "Postgres" }).click();
  await expect
    .element(page.getByLabelText("Recipe URL search"))
    .toHaveTextContent("package%2Fdb%3Apackage-db-postgres");
  await expect
    .element(page.getByLabelText("Recipe URL search"))
    .not.toHaveTextContent("package-db-sqlite");
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
    .element(page.getByText(/Removed modules that do not support/u))
    .toBeVisible();
  await expect
    .element(page.getByText("HTTP API Client", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByLabelText("Recipe URL search"))
    .not.toHaveTextContent("client-react-http-api");
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
    .element(page.getByText(/Removed modules that do not support/u))
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

test("should preserve a valid preview when catalog loading is retried", async () => {
  workerCalls.failCatalogOnce = true;
  await renderRecipeBuilder();

  await expect
    .element(page.getByRole("button", { name: "Retry options" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeEnabled();
  await expect
    .element(page.getByText("Preview could not be generated"))
    .not.toBeInTheDocument();

  await page.getByRole("button", { name: "Retry options" }).click();

  await expect
    .element(page.getByRole("button", { name: "Retry options" }))
    .not.toBeInTheDocument();
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

  await page.getByLabelText("Project name").fill("");

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
