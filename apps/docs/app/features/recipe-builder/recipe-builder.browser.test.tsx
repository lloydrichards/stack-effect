import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RecipeBuilder } from "./recipe-builder";
import type { CatalogAtomRequest, PreviewAtomRequest } from "./worker/client";

const workerCalls = vi.hoisted(() => ({
  catalog: 0,
  preview: 0,
  reconcileModules: false,
  failPreviewCatalogOnce: false,
  previewCatalogFailures: 0,
  addPreviewCatalogOwner: false,
  deferIdentityCatalog: false,
  catalogSources: [] as Array<"identity" | "preview">,
  pendingIdentityCatalogs: [] as Array<{
    interrupted: boolean;
    complete: () => void;
  }>,
  deferPreviews: false,
  pendingPreviews: [] as Array<{
    interrupted: boolean;
    complete: () => void;
  }>,
}));

vi.mock("./worker/client", async () => {
  const [
    { Effect },
    { Atom },
    { TargetIdentity, TargetKind },
    { recipeCatalogFixture },
  ] = await Promise.all([
    import("effect"),
    import("effect/unstable/reactivity"),
    import("@repo/domain/Catalog"),
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
    if (workerCalls.addPreviewCatalogOwner) {
      const identity = new TargetIdentity({
        kind: TargetKind.make("package"),
        name: "preview-only",
      });
      blueprintTargets.push({
        _tag: "target",
        id: "packages/preview-only",
        identity,
      });
    }

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
        workerCalls.catalog += 1;
        workerCalls.catalogSources.push(request.source);
        if (
          request.source === "preview" &&
          workerCalls.failPreviewCatalogOnce
        ) {
          workerCalls.failPreviewCatalogOnce = false;
          workerCalls.previewCatalogFailures += 1;
          return Effect.fail(new Error("Catalog enrichment failed."));
        }
        const catalog = workerCalls.reconcileModules
          ? {
              ...recipeCatalogFixture,
              targetModules: request.owners.map((owner) => ({
                owner,
                modules:
                  owner.kind === "client-react"
                    ? [
                        recipeCatalogFixture.targetModules[0]?.modules[0],
                      ].filter((module) => module !== undefined)
                    : (recipeCatalogFixture.targetModules.find(
                        (entry) => entry.owner.kind === owner.kind,
                      )?.modules ?? []),
              })),
            }
          : recipeCatalogFixture;
        if (request.source !== "identity" || !workerCalls.deferIdentityCatalog)
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
        workerCalls.preview += 1;
        if (!workerCalls.deferPreviews) {
          return Effect.succeed({ request, preview: previewFor(request) });
        }
        return Effect.callback((resume) => {
          const pending = {
            interrupted: false,
            complete: () =>
              resume(Effect.succeed({ request, preview: previewFor(request) })),
          };
          workerCalls.pendingPreviews.push(pending);
          return Effect.sync(() => {
            pending.interrupted = true;
          });
        });
      }),
    ),
  };
});

beforeEach(() => {
  workerCalls.catalog = 0;
  workerCalls.preview = 0;
  workerCalls.reconcileModules = false;
  workerCalls.failPreviewCatalogOnce = false;
  workerCalls.previewCatalogFailures = 0;
  workerCalls.addPreviewCatalogOwner = false;
  workerCalls.deferIdentityCatalog = false;
  workerCalls.catalogSources = [];
  workerCalls.pendingIdentityCatalogs = [];
  workerCalls.deferPreviews = false;
  workerCalls.pendingPreviews = [];
});

test("should generate a preview when the user completes a valid Selection", async () => {
  await render(<RecipeBuilder />);

  await page.getByRole("button", { name: "Client React Application" }).click();
  await page.getByText("HTTP API Client", { exact: true }).click();

  await expect
    .element(page.getByText(/Live in-memory pipeline/u))
    .toBeVisible();
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

test("should handle reconciled catalog and preview results once", async () => {
  await render(<RecipeBuilder />);

  await page.getByRole("button", { name: "Client React Application" }).click();
  await page.getByText("HTTP API Client", { exact: true }).click();
  await expect
    .element(page.getByRole("tab", { name: /api · server/u }))
    .toBeVisible();

  workerCalls.reconcileModules = true;
  const previewCallsBeforeReconciliation = workerCalls.preview;
  await page.getByLabelText("Target name").fill("renamed-web");
  await expect
    .element(page.getByText(/Removed modules that do not support/u))
    .toBeVisible();
  await expect
    .poll(() => workerCalls.preview)
    .toBeGreaterThan(previewCallsBeforeReconciliation);

  const catalogCallsAfterReconciliation = workerCalls.catalog;
  const previewCallsAfterReconciliation = workerCalls.preview;
  await page.getByRole("button", { name: "Node" }).click();
  await expect
    .poll(() => workerCalls.preview)
    .toBeGreaterThan(previewCallsAfterReconciliation);
  expect(workerCalls.catalog).toBe(catalogCallsAfterReconciliation);
});

test("should finish identity reconciliation before catalog enrichment", async () => {
  await render(<RecipeBuilder />);

  await page.getByRole("button", { name: "Client React Application" }).click();
  await page.getByText("HTTP API Client", { exact: true }).click();
  await expect
    .element(page.getByRole("tab", { name: /api · server/u }))
    .toBeVisible();

  workerCalls.reconcileModules = true;
  workerCalls.addPreviewCatalogOwner = true;
  workerCalls.deferIdentityCatalog = true;
  await page.getByLabelText("Target name").fill("renamed-web");
  await expect.poll(() => workerCalls.pendingIdentityCatalogs.length).toBe(1);

  const pendingIdentity = workerCalls.pendingIdentityCatalogs[0];
  expect(pendingIdentity?.interrupted).toBe(false);
  expect(workerCalls.catalogSources.at(-1)).toBe("identity");

  workerCalls.deferIdentityCatalog = false;
  pendingIdentity?.complete();

  await expect
    .element(page.getByText(/Removed modules that do not support/u))
    .toBeVisible();
  await expect.poll(() => workerCalls.catalogSources.at(-1)).toBe("preview");
  expect(pendingIdentity?.interrupted).toBe(false);
});

test("should generate a preview for a target without modules", async () => {
  await render(<RecipeBuilder />);

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

test("should preserve a valid preview while retrying catalog enrichment", async () => {
  await render(<RecipeBuilder />);

  await expect
    .element(page.getByText(/Live in-memory pipeline/u))
    .toBeVisible();
  workerCalls.failPreviewCatalogOnce = true;
  workerCalls.addPreviewCatalogOwner = true;
  await page.getByLabelText("Project name").fill("catalog-retry");

  await expect.poll(() => workerCalls.previewCatalogFailures).toBe(1);
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
  await render(<RecipeBuilder />);

  await expect
    .element(page.getByText(/Live in-memory pipeline/u))
    .toBeVisible();
  const command = page.getByLabelText("Command to run locally");
  await expect
    .element(command)
    .toHaveTextContent("bunx stack-effect create my-effect-app");

  await page.getByLabelText("Project name").fill("");

  await expect
    .element(
      page.getByText("Selection incomplete · showing last valid preview"),
    )
    .toBeVisible();
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

test("should interrupt stale and invalidated preview requests", async () => {
  await render(<RecipeBuilder />);

  await expect
    .element(page.getByText(/Live in-memory pipeline/u))
    .toBeVisible();
  workerCalls.deferPreviews = true;

  await page.getByLabelText("Project name").fill("first-name");
  await expect.poll(() => workerCalls.pendingPreviews.length).toBe(1);
  await page.getByLabelText("Project name").fill("second-name");
  await expect.poll(() => workerCalls.pendingPreviews.length).toBe(2);
  expect(workerCalls.pendingPreviews[0]?.interrupted).toBe(true);

  await page.getByLabelText("Project name").fill("");
  await expect
    .poll(() => workerCalls.pendingPreviews[1]?.interrupted)
    .toBe(true);
  await expect
    .element(
      page.getByText("Selection incomplete · showing last valid preview"),
    )
    .toBeVisible();
});
