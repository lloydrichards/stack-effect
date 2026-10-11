---
"stack-effect": minor
"@stack-effect/author": minor
---

Catalog templates can select content based on the modules attached to a target with `module` and `noModule` conditions.

Publishable libraries now use one `package.json` for workspace use and npm publication. Build before importing the library in the workspace, use `npm run dev` to watch changes, and run `npm run pack` or `npm publish` from the library directory.
