# CLI

- Start at `src/command.ts` for the published command tree and `src/authoring.ts` for repository catalog authoring. Follow the existing `effect/cli` command patterns and provide platform services through `PlatformLayer`.
- Production commands use `CatalogProvider.official`. Repository authoring uses `CatalogProvider.authoring`. Send registry warnings to stderr so JSON stdout remains parseable.
- For changes to flags, arguments, or help text, run `bun run docs:generate` from the repo root and review the generated CLI reference diff.
- Use `bun dev --filter=stack-effect` from the repo root to run the CLI in watch mode. Root `catalog:*` scripts use the authoring entrypoint and bundled definitions.
- Run `bun run test --filter=stack-effect` from the repo root. For a CLI end-to-end change, also use `bun run --cwd apps/cli test:e2e`. The E2E entrypoint at `e2e/entrypoint.ts` provides a controlled catalog response.

## Smoke-test non-interactive commands

Run manual smoke tests from the repo root against a temporary project. Use an EXIT trap to remove the project even if a command fails.

```bash
set -e
smoke_root="$(mktemp -d)"
trap 'rm -rf "$smoke_root"' EXIT

bun run start -- init smoke-app --yes --root "$smoke_root"
bun run start -- add --yes --root "$smoke_root/smoke-app" --target package/domain:domain-api-contracts --dry-run
bun run start -- add --yes --root "$smoke_root/smoke-app" --target client-react/web:client-react-http-api --dry-run
```

This checks named init, explicit module selection, and cross-target dependencies. Use the E2E suite when the check needs to run without the deployed registry.
