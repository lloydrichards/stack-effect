import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
// These transport tests exercise Vite and native HTTP responses directly.
// @effect-diagnostics asyncFunction:off globalFetch:off
import { createServer, type ViteDevServer } from "vite";
import { docMarkdownPath, docPages } from "../app/lib/docs-manifest";
import { docsMarkdown } from "../scripts/docs-markdown-plugin";
import vercel from "../vercel.json";

describe("documentation text HTTP responses", () => {
  let server: ViteDevServer;
  let origin: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      plugins: [docsMarkdown()],
      server: { host: "127.0.0.1", port: 0, watch: null },
      optimizeDeps: { noDiscovery: true },
      logLevel: "silent",
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string")
      throw new Error("Expected an HTTP address");
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    await server?.close();
  });

  it("serves fresh Markdown on GET and metadata without a body on HEAD", async () => {
    const response = await fetch(`${origin}/getting-started.md?download=1`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      response.headers.get("content-type"),
      "text/markdown; charset=utf-8",
    );
    assert.include(response.headers.get("link"), 'rel="describedby"');
    const text = await response.text();
    assert.include(text, "## Before you begin");
    const head = await fetch(`${origin}/getting-started.md`, {
      method: "HEAD",
    });
    assert.strictEqual(head.status, 200);
    assert.strictEqual(
      head.headers.get("content-length"),
      String(Buffer.byteLength(text)),
    );
    assert.strictEqual(await head.text(), "");
    const index = await fetch(`${origin}/llms.txt`);
    assert.strictEqual(
      index.headers.get("content-type"),
      "text/plain; charset=utf-8",
    );
    assert.include(await index.text(), "/use-with-coding-agents.md");
  });

  it.each([
    "/missing.md",
    "/use-with-coding-agents.md/extra",
    "/llms.txt/extra",
    "/llms-full.txt",
  ])("returns 404 instead of the SPA for %s", async (path) => {
    const response = await fetch(origin + path);
    assert.strictEqual(response.status, 404);
    assert.notInclude(await response.text(), "<html");
  });

  it("rejects writes and advertises text discovery on human documentation URLs", async () => {
    const response = await fetch(`${origin}/index.md`, { method: "POST" });
    assert.strictEqual(response.status, 405);
    assert.strictEqual(response.headers.get("allow"), "GET, HEAD");
    const html = await fetch(`${origin}/reference/cli/plan`);
    assert.include(
      html.headers.get("link"),
      '</reference/cli/plan.md>; rel="alternate"',
    );
  });

  it("keeps production discovery headers and missing-text rules ahead of the SPA fallback", () => {
    docPages.forEach((page) => {
      const headers = vercel.headers.find(
        (entry) => entry.source === page.route,
      )?.headers;
      assert.deepInclude(headers ?? [], {
        key: "Link",
        value: `<${docMarkdownPath(page.route)}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"`,
      });
    });
    const fallback = vercel.routes.findIndex(
      (route) => "dest" in route && route.dest === "/index.html",
    );
    ["/missing.md", "/llms-full.txt"].forEach((path) => {
      const missing = vercel.routes.findIndex(
        (route) =>
          "src" in route &&
          "status" in route &&
          route.status === 404 &&
          new RegExp(`^${route.src}$`).test(path),
      );
      assert.isAbove(
        missing,
        vercel.routes.findIndex((route) => "handle" in route),
      );
      assert.isBelow(missing, fallback);
    });
  });
});
