import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RecipeBuilder } from "../../../app/features/recipe-builder/recipe-builder";
import type {
  CatalogAtomRequest,
  PreviewAtomRequest,
} from "../../../app/features/recipe-builder/worker/client";

const workerCalls = vi.hoisted(() => ({
  reconcileModules: false,
  failPreviewCatalogOnce: false,
  addPreviewCatalogOwner: false,
  deferIdentityCatalog: false,
  catalogSources: [] as Array<"identity" | "preview">,
  pendingIdentityCatalogs: [] as Array<{
    interrupted: boolean;
    complete: () => void;
  }>,
  deferPreviews: false,
  pendingPreviews: [] as Array<{
    complete: () => void;
  }>,
}));

vi.mock("../../../app/features/recipe-builder/worker/client", async () => {
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
        workerCalls.catalogSources.push(request.source);
        if (
          request.source === "preview" &&
          workerCalls.failPreviewCatalogOnce
        ) {
          workerCalls.failPreviewCatalogOnce = false;
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
  workerCalls.failPreviewCatalogOnce = false;
  workerCalls.addPreviewCatalogOwner = false;
  workerCalls.deferIdentityCatalog = false;
  workerCalls.catalogSources = [];
  workerCalls.pendingIdentityCatalogs = [];
  workerCalls.deferPreviews = false;
  workerCalls.pendingPreviews = [];
});

test("should generate a usable preview when the user completes a valid Selection", async () => {
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

test("should remove unsupported modules when a renamed target resolves a different catalog", async () => {
  await render(<RecipeBuilder />);

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
});

test("should preserve rename reconciliation when preview enrichment adds catalog owners", async () => {
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

test("should generate a usable preview when the selected target has no modules", async () => {
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

test("should preserve a valid preview when catalog enrichment is retried", async () => {
  await render(<RecipeBuilder />);

  await expect
    .element(page.getByText(/Live in-memory pipeline/u))
    .toBeVisible();
  workerCalls.failPreviewCatalogOnce = true;
  workerCalls.addPreviewCatalogOwner = true;
  await page.getByLabelText("Project name").fill("catalog-retry");

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

test("should show the newest preview when an older request completes after it is superseded", async () => {
  await render(<RecipeBuilder />);

  await expect
    .element(page.getByText(/Live in-memory pipeline/u))
    .toBeVisible();
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
