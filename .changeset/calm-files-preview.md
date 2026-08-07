---
"stack-effect": minor
---

render complete generated file contents during `init`, `create`, and `add` dry runs with `--show-files` (#108).

For example:

```sh
stack-effect init my-app --yes --dry-run --show-files
```
