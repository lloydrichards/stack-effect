---
name: catalog-workspace
description: Use this skill whenever working on stack-effect catalog generated code, catalog template files, module definitions, scaffold templates, or anything under catalogs/official/templates or catalogs/official/src/modules. It teaches the agent to avoid editing catalog templates first; instead reset the generated catalog workspace, edit real generated files with LSP/type-check feedback, inspect git diff in the workspace, then port the minimal changes back into the catalog.
---

# Stack Effect Catalog Workspace

This skill is for changing generated code in the `stack-effect` catalog safely.

The catalog stores generated TypeScript/TSX/JSON/CSS/etc. as template files under `catalogs/official/templates/<owner>/`. They contain `{{token}}` and `{{#if}}` syntax and are excluded from type-checking and linting, so the LSP cannot validate the generated code in place. The safer workflow is to materialize the catalog into an editable generated workspace, make and validate changes there, then use the generated workspace diff to update the catalog source.

## Core Rule

Do not start by editing catalog template files directly.

Start from the generated catalog workspace whenever the task touches generated files, generated app/package code, module scaffolding behavior, or catalog templates. Use direct catalog edits only after you have learned the desired concrete file diff from the generated workspace.

## Commands

From the repo root:

```bash
bun run catalog:reset-workspace
bun run catalog:diff-workspace
bun run catalog:validate-workspace
```

The workspace lives at:

```text
workspace/catalog-built
```

It is ignored by the parent repository and has its own internal git baseline.

## Workflow

1. Reset the generated workspace:

   ```bash
   bun run catalog:reset-workspace
   ```

   This regenerates `workspace/catalog-built`, writes `.catalog-build-manifest.json`, annotates generated files where comments are safe, creates an internal git commit as the baseline, and adds ignored local workspace package links for editor resolution.
   It also runs the scaffold finalizer for the generated workspace, including
   module finalize scripts, dependency installation, lint, and format.

2. Locate the generated file that corresponds to the desired change.

   Use the generated paths and the source annotations at the top of TypeScript/TSX/CSS/HTML files. For strict formats like JSON, use `workspace/catalog-built/.catalog-build-manifest.json`.

3. Edit the generated file in `workspace/catalog-built`, not the catalog string.

   This gives LSP and TypeScript a real file to inspect. Make the code correct and idiomatic there first.

4. Validate the generated workspace.

   Run:

   ```bash
   bun run catalog:validate-workspace
   ```

   Reset already runs the scaffold finalizer, so validation should type-check
   the fully hydrated generated workspace.

5. Inspect the generated workspace diff:

   ```bash
   bun run catalog:diff-workspace
   ```

   This diff is the concrete desired change. Use it as the source of truth for what to port back into the catalog.

6. Port the minimal change back to the catalog source.

   Use `.catalog-build-manifest.json` and file annotations to find the relevant catalog template file or module contribution. Typical locations are:

   ```text
   catalogs/official/templates/**
   catalogs/official/src/modules/*.ts
   catalogs/official/src/targetRegistry.ts
   ```

7. Reset the workspace again and verify the diff disappears or matches the intended final generated output.

   ```bash
   bun run catalog:reset-workspace
   bun run catalog:diff-workspace
   ```

   A clean diff means the catalog now reproduces the edited generated workspace. A non-empty diff means some part of the workspace change has not been ported back, or the catalog produces a different result than intended.

8. Run repo checks before finishing:

   ```bash
   bun format
   bun lint
   bun run type-check
   ```

   For behavior changes, also run the impacted tests, usually:

   ```bash
   bun run test --filter=stack-effect
   ```

## Reading The Manifest

The manifest maps generated paths to catalog contributors:

```text
workspace/catalog-built/.catalog-build-manifest.json
```

Each file has contributors like:

```json
{
  "path": "apps/server-api/src/Rpc/Chat.ts",
  "contributors": [
    {
      "origin": "module",
      "targetKey": "apps/server-api",
      "moduleId": "chat-server",
      "contributionTag": "file"
    }
  ]
}
```

Use this to decide where to port a change:

- `origin: "module"` usually points to a module in `catalogs/official/src/modules/*.ts` and a template under `catalogs/official/templates/<module-id>/`.
- `origin: "target"` usually points to target base files in `catalogs/official/src/targetRegistry.ts` and templates under `catalogs/official/templates/<target-kind>/`.
- `contributionTag: "file"` means the generated file came from an authoritative template file. Follow the `template("./...")` call in the owning definition to find it: a template shared by several modules (for example the Biome `.vscode/settings.json` or the SQLite files reused by Postgres) lives under its first owner, and runtime variants carry a suffix such as `.lintstagedrc.deno.json`.
- `contributionTag: "ts-call-arg"`, `"ts-object-field"`, `"jsx-slot"`, `"barrel-export"`, or `"pkg-json-entry"` means the final file is composed from an operation in a module/target contribution. Port the operation, not just the final generated text.

## Editing Guidance

Prefer modifying generated files first even for small changes. It is easier to see import errors, JSX mistakes, Effect type errors, and missing dependencies in the generated workspace than inside template files.

When porting back:

- Keep the catalog change minimal.
- Edit template bytes exactly; they are embedded verbatim in the published catalog.
- Store names that Git, Oxfmt, or Oxlint read in nested directories (`.gitignore`, `.gitattributes`, `.oxfmtrc.json(c)`, `.oxlintrc.json`, `.editorconfig`) with the dot replaced by an underscore, e.g. `_gitignore`; the contribution `path` keeps the real name.
- Preserve catalog domain terms: Selection, Blueprint, Plan, Apply.
- For Effect code, follow `effect-fp` project style: `Effect.gen`, `yield*`, declarative transforms, and Effect error channels.
- Do not commit or stage `workspace/catalog-built`; it is a disposable generated workspace.

## Common Patterns

### Authoritative generated file

If the manifest contributor is a single `file` contribution, edit the generated file first, then port the final file contents back to the corresponding template file.

### Composed generated file

If the generated file includes target content plus module operations, inspect the diff carefully. A change may belong in:

- the base target template file,
- a module `ts-call-arg` contribution,
- a module `ts-object-field` contribution,
- a JSX slot contribution,
- a package JSON entry,
- or a barrel export contribution.

Do not blindly paste the whole composed file back into a base template file if the change really belongs to a module contribution.

### JSON files

Generated JSON files do not get inline comments. Use the manifest for provenance.

### Dependency Hydration

`catalog:reset-workspace` runs the scaffold finalizer, including dependency
installation and module finalize scripts such as shadcn component generation.
If reset fails because a package cannot be fetched or a finalize script cannot
run, treat that as a network/package-resolution/finalizer failure. If reset
succeeds, missing package typings such as `vite/client` are real
generated-workspace validation failures.

When `catalog:reset-workspace` fails during a `bunx shadcn@latest add ...`
finalizer step with:

```text
error: bun is unable to write files to tempdir: PermissionDenied
```

rerun the same reset command with sandbox escalation. The shadcn/bunx finalizer
needs temp/cache writes outside the repo sandbox even though the generated
workspace itself lives under `workspace/catalog-built`.

Use this justification:

```text
catalog workspace reset runs bunx/finalizer steps that need temp/cache writes outside the workspace sandbox
```

## Completion Checklist

Before final response:

- Generated workspace was reset before exploration.
- Intended generated-code change was made or inspected in `workspace/catalog-built` first.
- `bun run catalog:diff-workspace` was used to identify the patch to port.
- Catalog source was updated only after deriving the generated diff.
- Workspace was reset again to confirm the catalog reproduces the intended output.
- Required repo checks were run, or any skipped checks were clearly explained.
