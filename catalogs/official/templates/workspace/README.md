# {{projectName}}

A TypeScript workspace built with Effect. Runtime: `{{runtime}}`. Package manager: `{{packageManagerSpec}}`.

## Get started

{{#if runtime=bun}}Use Bun 1.4.2 and Node.js 24 or later.{{/if}}{{#if runtime=node}}Use Node.js 24 or later and `{{packageManagerSpec}}`.{{/if}}{{#if runtime=deno}}Use Deno 2.9.4.{{/if}} Run from the project root:

```sh
{{packageManager}} install
```

## Workspaces

{{workspaceTargets}}

Shared compiler configuration lives in `packages/config-typescript`. Workspace READMEs describe local setup, configuration, and development commands.

{{#if hasApps}}Complete any database or environment setup in those guides before starting the apps. Run development commands from each app directory, or use your monorepo tool to run the apps together.{{/if}}

## Commands

Run from the project root. Build and test commands run in workspaces that define the corresponding script. Without a monorepo tool, use the commands in each workspace README.

{{#if monorepo}}| Command | Purpose |
| --- | --- |
| `{{runCommand}} build` | Build workspaces |
| `{{runCommand}} type-check` | Check workspace TypeScript |
{{/if}}{{#if runtime=deno}}| Command | Purpose |
| --- | --- |
| `deno task dev:all` | Run workspace development tasks |
| `deno task build:all` | Build workspaces |
| `deno task type-check:all` | Check workspace TypeScript |
| `deno task test:all` | Run workspace tests |
{{/if}}
{{#if lint}}- `{{runCommand}} lint` lints source files.
{{/if}}{{#if format}}- `{{runCommand}} format` formats files.
{{/if}}{{#if test}}When a package has tests, add a `"test": "vitest run"` script to its `package.json`. Run it from the package or use the workspace test command from the root.
{{/if}}

## Initial scaffold recipe

From a separate parent directory, create a new `{{projectName}}` directory:

```sh
{{scaffoldRecipe}} --yes
```

This records the stack selection when this README was first generated. It does not include later code changes or targets added with `stack-effect add`. `@latest` and catalog updates can change the generated output.

See the [Stack Effect documentation](https://stack-effect.lloydrichards.dev) for CLI commands, targets, modules, and catalog options.
