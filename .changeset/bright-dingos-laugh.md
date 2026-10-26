---
"stack-effect": patch
---

TypeScript composition now rejects conflicting values for the same object field instead of silently keeping the existing value, while allowing repeated contributions that differ only in formatting.
