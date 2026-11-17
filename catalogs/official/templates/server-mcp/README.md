# {{packageName}}

Effect MCP server for tools, resources, prompts, and agent skills.

See the [project README]({{projectRoot}}/README.md) for installation and workspace commands. Run from this directory:

```sh
{{runCommand}} dev:watch
```

Connect an MCP client to `http://localhost:9009/mcp`. `src/index.ts` composes the server and selected handlers.

Run `{{runCommand}} build` to build the server or `{{runCommand}} type-check` to check TypeScript.
