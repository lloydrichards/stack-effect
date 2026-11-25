# Graph Task Planner

Use this package as a starting point for a small Effect library. [`src/TaskPlan.ts`](src/TaskPlan.ts) contains the public API, schemas, typed errors, and implementation in one place. To start your own module, give its public file a name such as `src/X.ts` and add a matching `./X` entry in `package.json`. If the implementation grows, move private code to `src/internal/x.ts`.

## Run the scratchpad

Install workspace dependencies first. From this package directory, run:

```sh
{{#if runtime=bun}}{{packageManager}} run{{/if}}{{#if runtime=node}}{{packageManager}} run{{/if}}{{#if runtime=deno}}deno task{{/if}} scratch
```

The root [`scratchpad.ts`](scratchpad.ts) decodes a sample task list and prints `build -> test -> publish`.

## Build and pack

For Bun or Node projects, select **Publishable Library** alongside **Graph Task Planner** to add the build and pack scripts. From this package directory, with Node and npm installed, run:

```sh
npm run build
npm pack
```

The tarball includes compiled JavaScript and TypeScript declarations under `dist/`. Install it in a separate project and import the public subpath:

```ts
import { planTasks, Tasks } from "{{packageName}}/TaskPlan";
```

Use your published package name in the import if you rename the package.
