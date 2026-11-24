# Domain contracts

- Put each shared schema, error, and helper in the module for the lifecycle concept it serves: `Selection`, `Blueprint`, `Plan`, `Apply`, `Finalize`, `Recipe`, `Catalog`, or `StackConfig`. Do not add utility or grab-bag modules. Use the [domain definitions](../../.okf/domain/index.md) for meaning and invariants.
- Import contracts from their declared subpath, such as `@repo/domain/Plan`. Add new public subpaths to this package's `exports` map when needed.
- Keep contracts portable across CLI and browser consumers. Put filesystem, HTTP, and terminal behavior in the service or application that owns it.
- Treat schema changes as boundary changes. Check affected readers and writers, including existing `stack.effect.json` files or published catalog documents when their persisted schemas change.
