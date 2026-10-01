import { Effect } from "effect";
import type { Connect, Plugin } from "vite";
import { docMarkdownPath, docPages } from "../app/lib/docs-manifest.ts";
import { generateDocsMarkdown } from "./docs-markdown.ts";

const textPaths = [
  ...docPages.map((page) => docMarkdownPath(page.route)),
  "/llms.txt",
];

const discoveryLink = (pathname: string) => {
  const page = docPages.find((entry) => entry.route === pathname);
  return page
    ? `<${docMarkdownPath(page.route)}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"`
    : '</llms.txt>; rel="describedby"';
};

const markdownMiddleware =
  (development: boolean): Connect.NextHandleFunction =>
  (request, response, next) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const isText =
      /\.md(?:\/|$)/.test(pathname) ||
      /^\/llms(?:-full)?\.txt(?:\/|$)/.test(pathname);
    if (!isText) {
      if (docPages.some((page) => page.route === pathname))
        response.setHeader("Link", discoveryLink(pathname));
      return next();
    }
    response.setHeader("Link", discoveryLink(pathname));
    if (!textPaths.includes(pathname)) {
      response.statusCode = 404;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      return response.end(
        request.method === "HEAD"
          ? undefined
          : "Documentation text not found.\n",
      );
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, HEAD");
      return response.end();
    }
    response.setHeader(
      "Content-Type",
      pathname === "/llms.txt"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8",
    );
    response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    if (!development) return next();
    void Effect.runPromise(generateDocsMarkdown()).then(
      (assets) => {
        const body = assets[pathname];
        if (body === undefined) {
          response.statusCode = 500;
          return response.end();
        }
        response.setHeader("Content-Length", Buffer.byteLength(body));
        return response.end(request.method === "HEAD" ? undefined : body);
      },
      (error) => {
        Effect.runSync(Effect.logError(error));
        response.statusCode = 500;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(
          request.method === "HEAD"
            ? undefined
            : "Could not generate documentation text.\n",
        );
      },
    );
  };

export const docsMarkdown = (): Plugin => ({
  name: "docs-markdown",
  configureServer(server) {
    server.middlewares.use(markdownMiddleware(true));
  },
  configurePreviewServer(server) {
    server.middlewares.use(markdownMiddleware(false));
  },
  generateBundle() {
    return Effect.runPromise(generateDocsMarkdown()).then((assets) => {
      Object.entries(assets).forEach(([pathname, source]) =>
        this.emitFile({ type: "asset", fileName: pathname.slice(1), source }),
      );
    });
  },
});
