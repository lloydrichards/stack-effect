---
"stack-effect": patch
---

Errors now say what failed on the first line and print why underneath, one `Caused by:` line per underlying error, instead of pasting the underlying message into the first line.

```text
Could not load catalog source mine.
  Caused by: Could not fetch catalog from https://registry.example/v1.json.
  Caused by: Transport error (GET https://registry.example/v1.json)
```
