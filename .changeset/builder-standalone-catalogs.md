---
"@stack-effect/docs": patch
---

Try standalone catalogs in Recipe Builder. The official catalog can now be removed when every selected catalog stands on its own, and tool, database, and Git options hide until it is added back. A catalog that declares `requires: ["official"]` keeps the official catalog selected, and a link that omits it offers to add it. Catalog fetches no longer send trace headers, so hosts that allow only `If-None-Match` pass the browser's CORS check.
