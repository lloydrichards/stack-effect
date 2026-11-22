// @effect-diagnostics asyncFunction:off
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { RecipeBuilder } from "../../../app/components/recipe-builder/recipe-builder";

test("shows the API target required by Cluster Counter Form (React)", async () => {
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
  const counter = page.getByText("Cluster Counter Form (React)", {
    exact: true,
  });

  await web.click();
  await expect.element(api).not.toBeInTheDocument();
  await counter.click();
  await expect.element(api).toBeVisible();
  await expect
    .element(api)
    .toHaveAccessibleDescription("Included automatically");

  await api.click();
  await expect
    .element(page.getByText("Cluster Counter", { exact: true }))
    .toBeVisible();

  await expect
    .element(page.getByRole("checkbox", { name: /^Cluster Counter\b/u }))
    .not.toBeInTheDocument();

  await web.click();
  await counter.click();
  await expect.element(api).not.toBeInTheDocument();
});
