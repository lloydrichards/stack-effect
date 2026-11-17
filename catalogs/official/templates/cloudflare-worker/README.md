# {{packageName}}

Effect HTTP API running on Cloudflare Workers, with contracts from `@repo/domain`.

See the [project README]({{projectRoot}}/README.md) for installation and workspace commands.

`src/Api.ts` defines the worker HTTP layer. Run `{{runCommand}} type-check` from this directory to check TypeScript.

{{#if module=alchemy-worker-deployment}}Use the root infrastructure scripts to preview or deploy this worker. Register the target in `alchemy.run.ts` and configure your Cloudflare credentials before running `{{packageManager}} run infra:plan` or `{{packageManager}} run infra:deploy` from the project root.
{{/if}}
