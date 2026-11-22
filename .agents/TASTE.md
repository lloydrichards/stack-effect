# Coding taste

Use these preferences when writing or reviewing TypeScript. The Todo HTTP API with SQLite is the reference for generated Effect code. Follow the [catalog workspace workflow](skills/catalog-workspace/SKILL.md) to try it. The [catalog authoring guide](../.okf/guides/catalog-authoring.md#effect-patterns-in-generated-code) describes the boundaries the example follows.

## Keep the operation readable

- Let the main operation read in execution order. Use blank lines between dependency lookup, decoding, the operation, and result handling where those are distinct steps.
- Use a short sequence of collection operations when it makes the transformation easy to follow. Use a loop when the order of steps or early exit is clearer that way.
- Keep short, single-use logic next to its caller. Extract a helper when its name explains a domain operation or when it removes meaningful duplication.

## Services and Layers

Use a named service class with a static `.layer`. Declare the caller-facing interface for reusable services. Infer private service interfaces when inference makes the code clearer. Use PascalCase role names for standalone Layers, such as `TodoHandlers` and `TodoRoutes`. Add `Layer` when the role alone is ambiguous.

The app chooses the database and crypto implementations. `Layer.provide` keeps them internal to the repository wiring. Use `Layer.provideMerge` when another consumer also needs a provided service. See the [repository](../catalogs/official/templates/package-db-todo-repository/src/TodoRepository.ts) and [app Layer](../catalogs/official/templates/server-todo-repository/src/Services/TodoRepository.ts).

```ts
export const TodoRepositoryLayer = TodoRepository.layer.pipe(
  Layer.provide([DatabaseLayer, PlatformCryptoLayer]),
);
```

## Schemas and handlers

Use `Schema.Struct` with a derived type for ordinary records. Brand IDs where their types must stay distinct. Use `Schema.Opaque` when the whole record needs a distinct construction boundary. See the [Todo schemas](../catalogs/official/templates/domain-todo-contracts/src/Todo.ts).

Get shared services when building the handler Layer. Get request-specific services inside the handler. An argument-free operation can be exposed as a lazy Effect value. See the [Todo HTTP handlers](../catalogs/official/templates/server-http-api-todos/src/Api/Todo.ts).

```ts
return handlers
  .handle("list", () => todos.list)
  .handle("get", ({ params }) => todos.get(params.id));
```
