---
"stack-effect": minor
---

`add` finds installed targets by their `package.json` name, so you can move a generated workspace and keep adding modules to it. Keep the manifest name and update workspace membership paths when moving a package.

New targets with non-default names follow their explicit paths. For example, `client-react/battle-app/frontend` creates `apps/battle-app/frontend`, and an unnamed React or Foldkit client still defaults to `apps/client`.
