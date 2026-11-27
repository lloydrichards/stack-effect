import { expect, test } from "@effect/vitest";
// @effect-diagnostics asyncFunction:off
import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { RecipeBuilder } from "../../../app/components/recipe-builder/recipe-builder";

test("CAFE protects a blank Foldkit target while the preset is selected", async () => {
  await render(
    <MemoryRouter
      initialEntries={["/builder?name=cafe-app&target=client-foldkit/"]}
    >
      <RecipeBuilder />
    </MemoryRouter>,
  );
  await page.getByRole("button", { name: /Targets & files/u }).click();
  await page
    .getByRole("button", { name: "Configure modules for web, client-foldkit" })
    .click();

  const settings = page.getByText("Target settings", { exact: true });
  const preset = page.getByRole("checkbox", { name: "CAFE Starter" });
  const origin = page
    .getByRole("button", {
      name: "Configure modules for web, client-foldkit",
    })
    .getByText("Included by CAFE Starter");
  await expect.element(settings).toBeVisible();

  await preset.click();
  await expect.element(origin).toBeVisible();
  await expect.element(settings).not.toBeInTheDocument();

  await preset.click();
  await expect.element(settings).toBeVisible();
});
