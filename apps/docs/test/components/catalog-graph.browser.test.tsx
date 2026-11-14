// Browser interaction callbacks use the async APIs exposed by Vitest Browser Mode.
// @effect-diagnostics asyncFunction:off
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import CatalogGraphPage from "../../app/routes/catalog-graph";

test("loads official and remote catalogs and exposes searchable node relationships", async () => {
  await render(<CatalogGraphPage />);
  await expect
    .element(
      page.getByRole("button", {
        name: "target: Project Initialization",
        exact: true,
      }),
    )
    .toBeVisible();
  await page
    .getByRole("button", {
      name: "target: Project Initialization",
      exact: true,
    })
    .click();
  await expect
    .element(page.getByRole("heading", { name: "Relationships", exact: true }))
    .toBeVisible();
  await page
    .getByRole("textbox", { name: "Search nodes" })
    .fill("no-such-node");
  await expect.element(page.getByText(/0 of .* nodes/)).toBeVisible();
  await page.getByRole("textbox", { name: "Search nodes" }).fill("");
  await page
    .getByRole("textbox", { name: "Remote catalog JSON URL" })
    .fill(`${location.origin}/registry-test/custom/acme.json`);
  await page
    .getByRole("checkbox", { name: "Include official catalog" })
    .click();
  await page
    .getByRole("button", { name: "Load catalogs", exact: true })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        name: "module: acme-api-rest module",
        exact: true,
      }),
    )
    .toBeVisible();
  await page
    .getByRole("button", { name: "module: acme-api-rest module", exact: true })
    .click();
  await expect
    .element(page.getByText("Source: remote · Cluster: api"))
    .toBeVisible();
  await page
    .getByRole("textbox", { name: "Remote catalog JSON URL" })
    .fill(`${location.origin}/registry-test/custom/ext.json`);
  await page
    .getByRole("button", { name: "Load catalogs", exact: true })
    .click();
  await expect.element(page.getByRole("alert")).toBeVisible();
});
