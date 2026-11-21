# Registry asset deployment

The docs site is deployed through Vercel. The repository's production GitHub deployment is created by `vercel[bot]`, the public docs response identifies Vercel, and the Vercel PR deployment metadata identifies `apps/docs` as the project root. [`vercel.json`](vercel.json) applies there.

`bun run --cwd apps/docs build` builds the three catalog workspaces in `catalogs/official`, `catalogs/author`, and `catalogs/labs`. It publishes their builds and regenerates the config schema from the local domain schema before building the site. A missing or stale build of any catalog stops the build. The generated files live under `apps/docs/public/registry/v1/` and `apps/docs/public/schemas/v1/`; they are not fetched from production or committed. Vercel publishes them at `/registry/v1/catalog.json`, `/registry/v1/author.json`, `/registry/v1/labs.json`, and `/schemas/v1/stack.effect.schema.json` in one deployment. The identifier fixtures `test/fixtures/published-catalog-ids.json` and `test/fixtures/published-author-catalog-ids.json` record published IDs. Exceptions in the asset test verify that IDs moved to Labs are available there and absent from the official document. Deploy the catalog assets together. Before cutting over, check the [migration instructions](app/content/catalog-registry.mdx) for existing projects. If a cached official document still contains a moved ID, revalidate the official source before composing it with Labs.

After a production deployment, check every asset:

```bash
bun run --cwd apps/docs check:registry https://stack-effect.lloydrichards.dev
```

For each asset, it checks a JSON `200` and `must-revalidate`. A cross-origin `If-None-Match` with the returned ETag must get a `304` that carries CORS headers, because browsers revalidate cross-origin. It also checks CORS on a cross-origin GET and on an `OPTIONS` preflight for both `If-None-Match` and `If-Modified-Since`. It also expects `404` for `/registry/v1/missing.json`, and exits non-zero on any failure. Run it against a publicly accessible Vercel preview before production. The current PR previews require Vercel SSO and return a `302` before the asset route runs, so their public HTTP behavior cannot be verified without a preview protection exception. A local docs build proves asset generation, not deployed response behavior.

Then prove the create path with a newly installed CLI:

```bash
bun run --cwd apps/cli verify:create-path
```

It installs `stack-effect@latest` in a temporary directory, creates a registry project from the deployed `author.json`, and checks that the saved sources are `official` and `author`. It then validates and builds the project's standalone catalog, and creates a second project that selects only that catalog. Pass another author URL or `--cli <npm spec>` to check a preview or a specific release.

To roll back a bad catalog, redeploy the previous known-good production deployment in the Vercel project's Deployments page. Run `check:registry` against it before resuming publication. If one asset alone is wrong, use the same rollback so every asset remains from one deployment. Then fix the source or generator and deploy a new build; do not edit generated assets by hand.
