---
"stack-effect": minor
---

add `plan` command for non-interactive blueprint and plan generation, closes #102

Reads a Selection + optional config from stdin, runs the Blueprint → Plan pipeline, and outputs structured JSON. Supports three output formats for different consumers:

```bash
  # Pipe a selection to get raw plan output
  echo '{"selection":{"targets":[{"kind":"server","name":"api"}]}}' | stack-effect plan --root ./my-app

  # Get an LLM-friendly format with resolved file contents
  echo '{"selection":{"targets":[...]}}' | stack-effect plan -f llm

  # Get a visual tree summary
  echo '{"selection":{"targets":[...]}}' | stack-effect plan -f tree
```
