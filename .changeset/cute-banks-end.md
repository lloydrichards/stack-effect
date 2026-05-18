---
"stack-effect": minor
---

add `schema` command to serialize the catalog and plan input schema, closes #109

Outputs a JSON object with the full catalog (targets, modules, dependencies, implications) and a JSON Schema for the `plan` command's stdin input. Designed for LLMs, CI pipelines, and external tooling to discover available scaffolding options programmatically:

```bash
  # Dump catalog and plan input schema
  stack-effect schema

  # Pipe into jq for inspection
  stack-effect schema | jq '.catalog.targets'
  stack-effect schema | jq '.planInput'
```
