// These transport tests exercise Vite and native HTTP responses directly.
// @effect-diagnostics asyncFunction:off globalFetch:off
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(response.headers.get("link")).toContain('rel="describedby"');
    const text = await response.text();
    expect(text).toContain("## Before you begin");
    const head = await fetch(`${origin}/getting-started.md`, {
      method: "HEAD",
    });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(
      String(Buffer.byteLength(text)),
    );
    expect(await head.text()).toBe("");
    const index = await fetch(`${origin}/llms.txt`);
    expect(index.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await index.text()).toContain("/use-with-coding-agents.md");
  });

  it.each([
    "/missing.md",
    "/use-with-coding-agents.md/extra",
    "/llms.txt/extra",
    "/llms-full.txt",
  ])("returns 404 instead of the SPA for %s", async (path) => {
    const response = await fetch(origin + path);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("<html");
  });

  it("rejects writes and advertises text discovery on human documentation URLs", async () => {
    const response = await fetch(`${origin}/index.md`, { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    const html = await fetch(`${origin}/reference/cli/plan`);
    expect(html.headers.get("link")).toContain(
      '</reference/cli/plan.md>; rel="alternate"',
    );
  });

  it("keeps production discovery headers and missing-text rules ahead of the SPA fallback", () => {
    docPages.forEach((page) => {
      const headers = vercel.headers.find(
        (entry) => entry.source === page.route,
      )?.headers;
      expect(headers).toContainEqual({
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
      expect(missing).toBeGreaterThan(
        vercel.routes.findIndex((route) => "handle" in route),
      );
      expect(missing).toBeLessThan(fallback);
    });
  });
});
