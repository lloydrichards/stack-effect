// Browser interaction callbacks use the async APIs exposed by Vitest Browser Mode.
// @effect-diagnostics asyncFunction:off
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { DocMarkdownActions } from "../../app/components/doc-markdown-actions";

afterEach(() => vi.restoreAllMocks());

test("loads the current page only when copying and copies its returned Markdown", async () => {
  const clipboard = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue();
  await render(<DocMarkdownActions href="/getting-started.md" />);
  expect(clipboard).not.toHaveBeenCalled();
  await expect
    .element(page.getByRole("link", { name: "View Markdown" }))
    .toHaveAttribute("href", "/getting-started.md");
  await page
    .getByRole("button", { name: "Copy Markdown", exact: true })
    .click();
  await expect
    .element(page.getByRole("button", { name: "Copied", exact: true }))
    .toBeVisible();
  expect(clipboard.mock.calls[0]?.[0]).toContain(
    "# Build your first Stack Effect project",
  );
});

test.each(["/__docs-test__/fallback", "/missing.md"])(
  "offers a visible recovery link when text retrieval fails: %s",
  async (href) => {
    const clipboard = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    await render(<DocMarkdownActions href={href} />);
    await page
      .getByRole("button", { name: "Copy Markdown", exact: true })
      .click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent(
        "Could not copy Markdown. Try again or use View Markdown.",
      );
    await expect
      .element(page.getByRole("button", { name: "Try copying again" }))
      .toBeEnabled();
    expect(clipboard).not.toHaveBeenCalled();
  },
);

test("allows retry after clipboard access is denied", async () => {
  const clipboard = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValueOnce(new Error("Denied"))
    .mockResolvedValue();
  await render(<DocMarkdownActions href="/index.md" />);
  await page
    .getByRole("button", { name: "Copy Markdown", exact: true })
    .click();
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent(
      "Could not copy Markdown. Try again or use View Markdown.",
    );
  await page.getByRole("button", { name: "Try copying again" }).click();
  await expect
    .element(page.getByRole("button", { name: "Copied", exact: true }))
    .toBeVisible();
  expect(clipboard).toHaveBeenCalledTimes(2);
});
