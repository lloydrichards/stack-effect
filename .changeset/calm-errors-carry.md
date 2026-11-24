---
"@stack-effect/author": minor
---

`OfficialCatalogUnavailable` and `CatalogBuildError` are now `Schema.TaggedError` classes. `OfficialCatalogUnavailable.message` names only the URL it could not load; read the fetch or decode failure from its new `cause` field instead of parsing the message.
