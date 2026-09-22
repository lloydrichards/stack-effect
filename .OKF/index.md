---
okf_version: "0.2"
---

# Stack Effect knowledge

Start with the [current scaffold lifecycle](architecture/scaffold-lifecycle.md). The research concepts describe proposals, not accepted implementation contracts.

- [Architecture](architecture/index.md) records current ownership and behavior.
- [Research](research/index.md) connects the VFS findings to open design questions.

The existing `.docs` material remains in place. A later migration can consolidate it concept by concept without treating historical proposals as accepted decisions.

Validate with `bunx okf-graph@0.3.0 validate .OKF --json`. This pins the validator without changing the project dependency baseline.
