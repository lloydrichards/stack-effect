---
name: stack-effect
description: Use Stack Effect to scaffold a new Effect TypeScript project, inspect a catalog module as a reference for another repository, or add targets and modules to a project with stack.effect.json.
---

# Scaffold with Stack Effect

Use the installed `stack-effect` CLI. If you use a package runner, pin a CLI version and use it throughout the task. Check the working directory, existing changes, and whether the intended project root contains `stack.effect.json`.

## Discover the current catalog

Run `stack-effect schema --root "$PROJECT_ROOT"`. Inspect `catalog.targets` for target kinds, module IDs, dependencies, and compatibility. Use `planInput` as the JSON Schema for input to `plan`. Pick target names that match the requested layout and reuse the identity of an existing target when extending it.

Use the same catalog sources for discovery, preview, and execution. An existing project normally uses the sources saved in `stack.effect.json`. For a new project, the official catalog is the default. Use the same explicit sources in `schema`, in `config.catalogs` for standalone planning, and in `create` when using custom catalogs. Add `--catalog official` alongside custom sources if they need official definitions.

## Create a new project

Use `create` for a new project. Pass one `--target kind/name:module[,module...]` per requested target. The CLI resolves required dependencies and reports ambiguous provider choices. If a provider is ambiguous, use the catalog and the user's requirements to choose and specify the provider.

```bash
stack-effect create my-app --root "$PARENT_DIR" --yes \
  --target client-react/web:client-react-web-worker --dry-run --show-files
```

Treat the IDs in examples as candidates and verify them against discovery. A named project goes under the given parent directory. Use `create . --root "$PROJECT_ROOT"` to use an existing empty directory directly. Review the preview, then remove `--dry-run --show-files` to create the authorized project. Include its Finalize commands in that review.

## Inspect a module for an existing repository

Use a read-only Plan to inspect a pattern, such as a Web Worker with Effect Atom in a React app. Start with an empty temporary directory to see the generated files in context. To see how the Plan compares with existing files, use the actual repository root and inspect its conflicts. For a repository without `stack.effect.json`, supply a complete `config` alongside `selection` on stdin. Use the current `planInput` schema and match the app's runtime and tooling.

For example, save this request as `plan-input.json` to inspect the worker in a Node project that uses npm:

```json
{
  "config": { "name": "worker-example", "runtime": { "_tag": "node", "packageManager": "npm" } },
  "selection": {
    "targets": [
      {
        "identity": { "kind": "client-react", "name": "web" },
        "modules": [{ "id": "client-react-web-worker" }]
      }
    ]
  }
}
```

```bash
stack-effect plan --root "$PLAN_ROOT" --format llm < plan-input.json > plan.llm.json
```

Read the generated worker, client integration, dependency changes, and editing instructions. Adapt the relevant files to the existing app's layout, dependencies, and conventions. Run its checks and exercise the feature. Keep the scratch project and Plan input outside the app.

## Add modules to a Stack Effect project

Use `add` at the root containing `stack.effect.json`. For instance, preview adding Husky to the workspace:

```bash
stack-effect add --root "$PROJECT_ROOT" --yes \
  --target workspace/root:workspace-devenv-husky --dry-run --show-files
```

For a structured preview, pass the corresponding Selection to `plan` at the same root. The saved configuration supplies `config`. Review the resolved dependencies, paths, and Finalize commands. When the preview is conflict-free and the work is authorized, rerun `add` without `--dry-run --show-files`.

## Review a Plan before making changes

- Both `--format llm` and `--format raw` output JSON. Use `llm` for file contents and editing instructions, `raw` for exact operations, or `tree` for a path summary. Plan reads JSON from stdin and leaves project files untouched.
- Check `sources` and `notes` in structured output for catalog digests, freshness, and trust. Re-plan when the repository or catalog changes before applying edits.
- Resolve conflicts against the current file contents. `--yes` skips ordinary conflicted paths, and required dependency conflicts can stop Apply. Plan JSON is for inspection. The CLI has no command for replaying it with chosen conflict decisions.
- `--yes` skips prompts and can run official Finalize scripts. Keep custom scripts out of unattended execution unless the user authorizes them after review. `--trust` permits all Finalize scripts, including custom ones. If authorization covers file edits only, use the Plan to guide those edits and leave the scripts for later.
- Review the resulting diff, run the project's checks, and exercise the requested feature. Report skipped paths or setup commands.

[Agent guide and catalog override examples](https://stack-effect.lloydrichards.dev/use-with-coding-agents.md)
