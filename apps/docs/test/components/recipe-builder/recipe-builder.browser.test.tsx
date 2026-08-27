import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type {
  CatalogAtomRequest,
  PreviewAtomRequest,
} from "../../../app/atom/recipe-builder-atom";
import { RecipeBuilder } from "../../../app/components/recipe-builder/recipe-builder";
import {
  dddRecipeCatalogFixture,
  recipeCatalogFixture,
} from "./recipe-fixtures";

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
  previewRequests: [] as Array<PreviewAtomRequest>,
  previewTargets: [] as Array<{
    readonly kind: string;
    readonly name: string;
    readonly architecture?: string;
  }>,
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
  const [
    { Effect },
    { Atom },
    { dddRecipeCatalogFixture, recipeCatalogFixture },
  ] = await Promise.all([
    import("effect"),
    import("effect/unstable/reactivity"),
    import("./recipe-fixtures"),
  ]);
  const previewFor = ({ input }: PreviewAtomRequest) => {
    const targets = input.recipe.targets.map(
      ({ target, modules, architecture }) => ({
        identity: target,
        modules: modules.map((id) => ({ id })),
        ...(architecture === undefined ? {} : { architecture }),
      }),
    );
    const blueprintTargets = targets.map(({ identity, architecture }) => ({
      _tag: "target" as const,
      id:
        identity.kind === "workspace"
          ? "."
          : identity.kind === "package"
            ? `packages/${identity.name}`
            : `apps/${identity.kind}-${identity.name}`,
      identity,
      ...(architecture === undefined ? {} : { architecture }),
    }));
    workerCalls.previewTargets.push(
      ...targets.map(({ identity, architecture }) => ({
        kind: identity.kind,
        name: identity.name,
        ...(architecture === undefined ? {} : { architecture }),
      })),
    );
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
        const fixture =
          request.architecture === "ddd"
            ? dddRecipeCatalogFixture
            : recipeCatalogFixture;
        const requestedOwners = new Set(
          request.targets.map(({ owner }) => owner.toKey()),
        );
        const requestedTargetModules = request.targets.map(({ owner }) => ({
          owner,
          modules:
            fixture.targetModules.find(
              (entry) => entry.owner.toKey() === owner.toKey(),
            )?.modules ??
            fixture.targetModules.find(
              (entry) => entry.owner.kind === owner.kind,
            )?.modules ??
            [],
        }));
        const catalog = {
          ...fixture,
          targetModules: workerCalls.reconcileModules
            ? request.targets.map(({ owner }) => ({
                owner,
                modules:
                  owner.kind === "client-react"
                    ? [fixture.targetModules[0]?.modules[0]].filter(
                        (module) => module !== undefined,
                      )
                    : (fixture.targetModules.find(
                        (entry) => entry.owner.kind === owner.kind,
                      )?.modules ?? []),
              }))
            : [
                ...requestedTargetModules,
                ...fixture.targetModules.filter(
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
        workerCalls.previewRequests.push(request);
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
  workerCalls.previewRequests = [];
  workerCalls.previewTargets = [];
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

test("keeps the DDD fixture projection separate from Classic database modules", () => {
  expect(
    recipeCatalogFixture.targetModules.some(
      ({ owner }) => owner.kind === "package" && owner.name === "db",
    ),
  ).toBe(true);
  expect(
    dddRecipeCatalogFixture.targetModules.some(
      ({ owner }) => owner.kind === "package" && owner.name === "db",
    ),
  ).toBe(false);
  expect(JSON.stringify(dddRecipeCatalogFixture)).not.toContain("db-sql");
});

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

test("should render shared DDD availability, implication provenance, and live preview facets", async () => {
  await renderRecipeBuilder();

  await page.getByRole("radio", { name: /Domain-Driven Design/u }).click();
  await expect.element(page.getByText("Todo HTTP · server/api")).toBeVisible();
  await expect
    .element(
      page.getByText(
        /apps\/server-api · packages\/shared\/domain · packages\/todo\/domain · packages\/todo\/application · packages\/todo\/infrastructure · packages\/todo\/presentation/u,
      ),
    )
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "Memory is always included and is the default. SQLite and PostgreSQL are optional additive selections.",
      ),
    )
    .toBeVisible();
  await expect
    .element(page.getByText(/runnable PostgreSQL support is included/u))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Client React Application" }).click();

  await expect
    .element(
      page.getByText(
        "Classic only. DDD currently supports the Todo HTTP client and Todo HTTP API.",
      ),
    )
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "Select a supported Todo HTTP module or use Classic architecture.",
      ),
    )
    .toBeVisible();

  await page.getByText("Todo HTTP Client", { exact: true }).click();
  await expect
    .element(page.getByRole("heading", { name: "Resolution preview" }))
    .toBeVisible();
  await expect
    .element(
      page.getByText(/selected client-react\/web:client-react-http-api-todos/u),
    )
    .toBeVisible();
  await expect
    .element(
      page.getByText(/implied server\/api:server-http-api-todos/u).first(),
    )
    .toBeVisible();
  await expect
    .element(page.getByText(/source client-react\/web/u).first())
    .toBeVisible();
  await expect
    .element(
      page.getByText(/The DDD Todo client requires the Todo HTTP API/u).first(),
    )
    .toBeVisible();
  await expect
    .element(
      page.getByRole("heading", { name: "Normalized Recipe and Selection" }),
    )
    .toBeVisible();
  await expect
    .element(page.getByText(/"recipe": \{\s*"targets":/u))
    .toBeVisible();
  await expect
    .element(page.getByText(/"database": "none"/u))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("heading", { name: "Blueprint" }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole("heading", { name: "Dependency and implication graph" }),
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Package graph" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Prospective files" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Command" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Prospective stack config" }))
    .toBeVisible();
  expect(workerCalls.catalogRequests.at(-1)).toMatchObject({
    architecture: "ddd",
    targets: expect.arrayContaining([
      expect.objectContaining({
        owner: expect.objectContaining({ kind: "server", name: "api" }),
      }),
    ]),
  });

  const expectProviderRequest = async (modules: ReadonlyArray<string>) => {
    await expect
      .poll(() => workerCalls.previewRequests.at(-1))
      .toMatchObject({
        input: {
          recipe: {
            targets: expect.arrayContaining([
              {
                target: { kind: "server", name: "api" },
                architecture: "ddd",
                modules,
              },
            ]),
          },
        },
      });
  };
  await page.getByRole("button", { name: "SQLite" }).click();
  await expectProviderRequest([
    "server-http-api-todos",
    "server-http-api-todos-provider-sqlite",
  ]);
  await page.getByRole("button", { name: "PostgreSQL" }).click();
  await expectProviderRequest([
    "server-http-api-todos",
    "server-http-api-todos-provider-sqlite",
    "server-http-api-todos-provider-postgres",
  ]);
  expect(workerCalls.previewTargets).toContainEqual({
    kind: "server",
    name: "api",
    architecture: "ddd",
  });
  await page.getByRole("button", { name: "SQLite" }).click();
  await expectProviderRequest([
    "server-http-api-todos",
    "server-http-api-todos-provider-postgres",
  ]);
  await page.getByRole("button", { name: "PostgreSQL" }).click();
  await expectProviderRequest(["server-http-api-todos"]);
});

test("should bind DDD database providers to the canonical server/api target", async () => {
  await renderRecipeBuilder();

  await page.getByRole("radio", { name: /Domain-Driven Design/u }).click();
  await page.getByRole("button", { name: "Client React Application" }).click();
  await page.getByText("Todo HTTP Client", { exact: true }).click();

  await expect
    .element(page.getByRole("button", { name: "SQLite" }))
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
