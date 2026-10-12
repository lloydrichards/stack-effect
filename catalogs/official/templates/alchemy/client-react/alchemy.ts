// Generated from stack-effect catalog. Edit this workspace, then use git diff to port changes back.
// Catalog contributors: apps/{{packageName}}#alchemy-{{packageName}}site:file

// @effect-diagnostics nodeBuiltinImport:off
// oxlint-disable-next-line effecttsgo/node-builtin-import -- Deployment runs in Node and needs an absolute package path.
import { fileURLToPath } from "node:url";
import type { Input } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";

export default (env: Readonly<Record<string, Input<string>>> = {}) =>
  Cloudflare.Website.Vite("{{packageName}}", {
    rootDir: fileURLToPath(new URL("./", import.meta.url)),
    env,
    assets: { notFoundHandling: "single-page-application" },
  });
