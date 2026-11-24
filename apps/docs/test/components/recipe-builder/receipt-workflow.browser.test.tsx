import { assert, expect, test } from "@effect/vitest";
// @effect-diagnostics asyncFunction:off
import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { RecipeBuilder } from "../../../app/components/recipe-builder/recipe-builder";

test.each(["client-react", "client-foldkit"])(
  "uses the Project setup database for the %s receipt form",
  async (target) => {
    const labs = new URL("/registry/v1/labs.json", window.location.origin);
    const params = new URLSearchParams([
      ["name", "receipt-app"],
      ["catalog", "official"],
      ["catalog", `labs=${labs.href}`],
      ["target", `${target}/web`],
    ]);
    await render(
      <MemoryRouter initialEntries={[`/builder?${params}`]}>
        <RecipeBuilder />
      </MemoryRouter>,
    );

    const showTargets = () =>
      page.getByRole("button", { name: /Targets & files/u }).click();
    const showDatabase = async () => {
      await page.getByRole("button", { name: /Project setup/u }).click();
      const database = page.getByRole("button", { name: /^Database/u });
      if (database.element().getAttribute("aria-expanded") === "false") {
        await database.click();
      }
    };

    await showTargets();
    await page
      .getByRole("button", { name: `Configure modules for web, ${target}` })
      .click();

    const form = page.getByRole("checkbox", { name: /Receipt Workflow Form/u });
    await expect.element(form).toBeDisabled();

    await showDatabase();
    await page.getByRole("button", { name: "SQLite", exact: true }).click();
    await showTargets();
    await expect.element(form).toBeEnabled();
    await page.getByText("Receipt Workflow Form", { exact: true }).click();

    await showDatabase();
    await expect
      .element(page.getByRole("button", { name: "None", exact: true }))
      .toBeDisabled();
    await page.getByRole("button", { name: "Postgres", exact: true }).click();
    await showTargets();

    await expect.element(form).toBeChecked();
    await expect
      .element(page.getByRole("button", { name: "Copy command" }))
      .toBeEnabled();
    const command = page.getByLabelText("Command to run locally");
    await expect
      .poll(() => command.element().textContent)
      .toContain("--target package/db:package-db-postgres");
    assert.notInclude(command.element().textContent, "package-db-sqlite");
  },
);
