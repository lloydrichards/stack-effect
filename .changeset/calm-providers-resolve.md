---
"stack-effect": minor
---

`init`, `add`, and `create` now add the provider a selected module needs when only one compatible module provides it, such as a cache module's backing store. When several modules could provide it, the command lists them and asks you to select one with `--target`; when none can, it names the missing capability and target. `catalog workspace reset` without `--target` picks the first provider in catalog order.
