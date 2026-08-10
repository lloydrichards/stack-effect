import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type {
  CatalogAtomRequest,
  PreviewAtomRequest,
} from "../../atom/worker-atom";
import { RecipeBuilder } from "./recipe-builder";

vi.mock("../../atom/worker-atom", async () => {
  const [{ Effect, Result }, { Atom }, { recipeCatalogFixture }] =
    await Promise.all([
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
    catalogAtom: Atom.fn((request: CatalogAtomRequest) =>
      Effect.succeed({
        request,
        result: Result.succeed(recipeCatalogFixture),
      }),
    ),
    previewAtom: Atom.fn((request: PreviewAtomRequest) =>
      Effect.succeed({
        request,
        result: Result.succeed(previewFor(request)),
      }),
    ),
  };
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
