// Browser interactions use the async APIs exposed by Vitest Browser Mode.
// @effect-diagnostics asyncFunction:off
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import CatalogPrototypesPage from "../../app/routes/catalog-prototypes";

for (const direction of ["ribbon", "bands", "lanes"]) {
  test(`${direction}: shared selection, target decisions, provider resolution, and Builder review`, async () => {
    await render(
      <MemoryRouter initialEntries={[`/catalog-prototypes?view=${direction}`]}>
        <CatalogPrototypesPage />
      </MemoryRouter>,
    );
    await expect
      .element(
        page.getByRole("button", {
          name:
            direction === "bands"
              ? "+ Add target"
              : "Inspect target kind client-react",
          exact: true,
        }),
      )
      .toBeVisible();
    const modulePosition = document.querySelector(".node-position");
    expect(modulePosition?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(modulePosition?.closest("svg.graph-surface")).not.toBeNull();
    expect(document.querySelector(".target-jumpbar .graph-node")).toBeNull();
    await page
      .getByRole("textbox", { name: "Search modules", exact: true })
      .fill("client-react-http-api-todos");
    await page
      .getByRole("button", {
        name: "Add result client-react-http-api-todos",
        exact: true,
      })
      .click();
    await expect
      .element(
        page.getByRole("button", { name: "Review for Builder", exact: true }),
      )
      .toBeDisabled();
    await page
      .getByRole("button", { name: "Create client-react target", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create package/domain", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create server target", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create package/db", exact: true })
      .click();
    const other =
      direction === "ribbon" ? "B / Staggered islands" : "A / Target ribbon";
    await page.getByRole("button", { name: new RegExp(other) }).click();
    await expect
      .element(
        page.getByRole("button", {
          name: "Locate decision Choose db-sql provider",
          exact: true,
        }),
      )
      .toBeVisible();
    await page.getByRole("button", { name: /SQLite Database/ }).click();
    await page
      .getByRole("button", { name: "Review for Builder", exact: true })
      .click();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    await expect
      .element(page.getByRole("link", { name: "Continue in Builder" }))
      .toHaveAttribute(
        "href",
        expect.stringContaining("target=client-react%2Fweb"),
      );
    await page
      .getByRole("button", { name: "Close review", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Search modules", exact: true })
      .fill("client-react-http-api-todos");
    await page
      .getByRole("button", {
        name: "Inspect search result client-react-http-api-todos",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Remove from selection", exact: true })
      .click();
    await expect
      .element(
        page.getByRole("button", {
          name: "Add result client-react-http-api-todos",
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(
        page.getByRole("button", {
          name: "Keep server-http-api-todos explicitly",
          exact: true,
        }),
      )
      .not.toBeInTheDocument();
  });
}

test("conflicting modules are disabled and their explanation remains inspectable", async () => {
  await render(
    <MemoryRouter
      initialEntries={[
        "/catalog-prototypes?target=workspace/my-effect-app:workspace-monorepo-turbo",
      ]}
    >
      <CatalogPrototypesPage />
    </MemoryRouter>,
  );
  await page
    .getByRole("textbox", { name: "Search modules", exact: true })
    .fill("workspace-monorepo-nx");
  await expect
    .element(
      page.getByRole("button", {
        name: "Add result workspace-monorepo-nx",
        exact: true,
      }),
    )
    .toBeDisabled();

  await page
    .getByRole("button", {
      name: "Inspect search result workspace-monorepo-nx",
      exact: true,
    })
    .click();
  await expect
    .element(page.getByText("Unavailable with this selection", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      page.getByText(/Turborepo conflicts with Nx|Nx conflicts with Turborepo/),
    )
    .toBeVisible();
});

test("remote source removal requires reviewing affected selections", async () => {
  const params = new URLSearchParams();
  params.append("catalog", "official");
  params.append(
    "catalog",
    `ext=${location.origin}/registry-test/custom/ext.json`,
  );
  params.append("target", "server/api:ext-auth");
  await render(
    <MemoryRouter initialEntries={[`/catalog-prototypes?${params}`]}>
      <CatalogPrototypesPage />
    </MemoryRouter>,
  );
  await page
    .getByRole("textbox", { name: "Search modules", exact: true })
    .fill("ext-auth");
  await expect
    .element(
      page.getByRole("button", {
        name: "Inspect result ext-auth",
        exact: true,
      }),
    )
    .toBeVisible();
  await page.getByText("Catalog sources", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Selected catalog sources" })
    .fill("official");
  await page
    .getByRole("button", { name: "Load catalogs", exact: true })
    .click();
  await expect
    .element(page.getByRole("dialog", { name: "Review catalog change" }))
    .toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Inspect result ext-auth",
        exact: true,
      }),
    )
    .toBeVisible();
  await page
    .getByRole("button", { name: "Load catalogs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm catalog change", exact: true })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Inspect result ext-auth",
        exact: true,
      }),
    )
    .not.toBeInTheDocument();
});

test("targets are added from the panel and discover compatible modules without catalog hubs", async () => {
  await render(
    <MemoryRouter initialEntries={["/catalog-prototypes?view=bands"]}>
      <CatalogPrototypesPage />
    </MemoryRouter>,
  );
  await page
    .getByRole("button", { name: "+ Add targets", exact: true })
    .click();
  await expect
    .element(page.getByRole("combobox", { name: "Target kind", exact: true }))
    .toBeVisible();
  await page
    .getByRole("combobox", { name: "Target kind", exact: true })
    .selectOptions("client-react");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("web");
  await page
    .getByRole("button", { name: "Create target", exact: true })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Add client-react-http-api-todos to client-react/web",
        exact: true,
      }),
    )
    .toBeVisible();
  expect(document.querySelector(".organic-hub")).toBeNull();
  expect(document.querySelectorAll(".graph-node.target")).toHaveLength(1);
  await page
    .getByRole("button", {
      name: "Add client-react-http-api-todos to client-react/web",
      exact: true,
    })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Add client-react-http-api-todos to client-react/web",
        exact: true,
      }),
    )
    .toBeDisabled();
  await expect
    .element(
      page.getByRole("button", {
        name: "Create client-react target",
        exact: true,
      }),
    )
    .not.toBeInTheDocument();
});

test("server features unlock beneath Chat RPC and MCP Client instead of directly on the target", async () => {
  await render(
    <MemoryRouter
      initialEntries={["/catalog-prototypes?view=bands&target=server/api"]}
    >
      <CatalogPrototypesPage />
    </MemoryRouter>,
  );
  await expect
    .element(
      page.getByRole("button", { name: "Inspect server/api", exact: true }),
    )
    .toBeInTheDocument();
  await page
    .getByRole("button", { name: "+ Add targets", exact: true })
    .click();
  await page
    .getByRole("complementary", {
      name: "Selection inspector and decisions",
      exact: true,
    })
    .getByRole("button", { name: "server/api", exact: true })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Add server-chat-mcp-tools to server/api",
        exact: true,
      }),
    )
    .toBeDisabled();
  await expect
    .element(
      page.getByRole("button", {
        name: "Add server-chat-mcp to server/api",
        exact: true,
      }),
    )
    .toBeDisabled();
  await page
    .getByRole("button", {
      name: "Add server-chat-rpc to server/api",
      exact: true,
    })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Add server-chat-mcp to server/api",
        exact: true,
      }),
    )
    .toBeEnabled();
  await expect
    .element(
      page.getByRole("button", {
        name: "Add server-chat-mcp-tools to server/api",
        exact: true,
      }),
    )
    .toBeDisabled();
  await page
    .getByRole("button", {
      name: "Add server-chat-mcp to server/api",
      exact: true,
    })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Add server-chat-mcp-tools to server/api",
        exact: true,
      }),
    )
    .toBeEnabled();
  await page
    .getByRole("button", {
      name: "Add server-chat-mcp-tools to server/api",
      exact: true,
    })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Add server-chat-mcp-tools to server/api",
        exact: true,
      }),
    )
    .toBeDisabled();
});
