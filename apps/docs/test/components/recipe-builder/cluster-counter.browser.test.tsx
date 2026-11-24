import { expect, test } from "@effect/vitest";
// @effect-diagnostics asyncFunction:off
import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { RecipeBuilder } from "../../../app/components/recipe-builder/recipe-builder";

test("shows the API target and dependencies required by Cluster Counter Form", async () => {
  const labs = new URL("/registry/v1/labs.json", window.location.origin);
  const params = new URLSearchParams([
    ["name", "counter-app"],
    ["catalog", "official"],
    ["catalog", `labs=${labs.href}`],
    ["target", "client-react/web:config-typescript-vite"],
  ]);
  await render(
    <MemoryRouter initialEntries={[`/builder?${params}`]}>
      <RecipeBuilder />
    </MemoryRouter>,
  );

  await page.getByRole("button", { name: /Targets & files/u }).click();

  const web = page.getByRole("button", {
    name: "Configure modules for web, client-react",
  });
  const api = page.getByRole("button", {
    name: "Configure modules for api, server",
  });
  const counter = page.getByText("Cluster Counter Form", {
    exact: true,
  });

  await web.click();
  await expect.element(api).not.toBeInTheDocument();
  await counter.click();
  await expect.element(api).toBeVisible();
  await expect
    .element(api)
    .toHaveAccessibleDescription("Included automatically");

  const dependencies = page.getByRole("list", {
    name: "Dependencies of Cluster Counter Form",
  });
  for (const title of [
    "Cluster Counter API",
    "HTTP API Endpoints",
    "HTTP API Contracts",
    "Cluster Counter Contracts",
  ]) {
    await expect
      .element(dependencies.getByText(title, { exact: true }))
      .toBeVisible();
  }

  await api.click();
  await expect
    .element(page.getByText("Cluster Counter API", { exact: true }))
    .toBeVisible();

  await expect
    .element(page.getByRole("checkbox", { name: /^Cluster Counter\b/u }))
    .not.toBeInTheDocument();

  await page.getByText("Effect DevTools", { exact: true }).click();
  await page.getByText("Target settings", { exact: true }).click();
  const targetName = page.getByLabelText("Target name");
  await targetName.fill("renamed-api");
  const renamedApi = page.getByRole("button", {
    name: "Configure modules for renamed-api, server",
  });
  await expect.element(api).toBeVisible();
  await expect.element(renamedApi).toHaveAttribute("aria-expanded", "true");
  await expect.element(api).toHaveAttribute("aria-expanded", "false");
  await api.click();
  await expect.element(api).toHaveAttribute("aria-expanded", "true");
  await expect.element(renamedApi).toHaveAttribute("aria-expanded", "false");
  await expect.element(targetName).not.toBeInTheDocument();

  await web.click();
  await counter.click();
  await expect.element(api).not.toBeInTheDocument();
  await expect.element(renamedApi).toBeVisible();
});

test("keeps the database provider under Project setup control", async () => {
  await render(
    <MemoryRouter initialEntries={["/builder"]}>
      <RecipeBuilder />
    </MemoryRouter>,
  );

  const chooseDatabase = async (name: string) => {
    await page.getByRole("button", { name: /Project setup/u }).click();
    const database = page.getByRole("button", { name: /^Database/u });
    if (database.element().getAttribute("aria-expanded") === "false")
      await database.click();
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: /Targets & files/u }).click();
    await page
      .getByRole("button", { name: "Configure modules for db, package" })
      .click();
  };

  await chooseDatabase("SQLite");
  await expect
    .element(page.getByText("SQLite Database", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("checkbox", { name: /^SQLite Database/u }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("checkbox", { name: /^Postgres Database/u }))
    .toBeDisabled();

  await page
    .getByRole("button", { name: "Configure modules for db, package" })
    .click();
  await chooseDatabase("Postgres");
  await expect
    .element(page.getByText("Postgres Database", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("checkbox", { name: /^Postgres Database/u }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("checkbox", { name: /^SQLite Database/u }))
    .toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: "Copy command" }))
    .toBeEnabled();
});
