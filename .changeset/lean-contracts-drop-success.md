---
"stack-effect": minor
---

Generated API contracts no longer carry a `success` flag. The HTTP `Hello` response is `{ message }`, and the presence `setStatus` RPC returns nothing. A failure is the typed error, not `success: false`.

**Migration:** `add` rewrites the shared contracts when it adds a server module, but it leaves an existing client alone. If your React client still reads `data.success`, for example in `src/components/rest-card.tsx`, delete that line, or run `add` again with the client's HTTP module selected to regenerate it.
