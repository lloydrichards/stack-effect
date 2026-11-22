# Coding taste

Use these preferences when writing or reviewing TypeScript. The Todo HTTP API with SQLite is the reference for generated Effect code. Follow the [catalog workspace workflow](skills/catalog-workspace/SKILL.md) to try it. The [catalog authoring guide](../.okf/guides/catalog-authoring.md#effect-patterns-in-generated-code) describes the boundaries the example follows.

## Keep the operation readable

- Let the main operation read in execution order. Use blank lines between dependency lookup, decoding, the operation, and result handling where those are distinct steps.
- Use a short sequence of collection operations when it makes the transformation easy to follow. Use a loop when the order of steps or early exit is clearer that way.
- Keep a workflow in one function unless a part needs to compose independently or has a real second caller. Use blank lines to mark stages. The GitHub webhook keeps signature parsing, the bounded body read, and verification together before decoding the event. See the [GitHub webhook](../catalogs/labs/templates/server-github-issue-label/src/webhooks/github.ts).
- Use an `Effect.fn` transform when a policy applies to the whole operation. Keep step-specific error mapping or recovery next to the step it handles. See how the [Summary Queue](../catalogs/labs/templates/cli-persisted-queue/src/jobs/SummaryQueue.ts) provides its Layer for an entire operation.

## Services and Layers

Use a named service class with a static `.layer`. Declare the caller-facing interface for reusable services. Infer private service interfaces when inference makes the code clearer. Use PascalCase role names for standalone Layers, such as `TodoHandlers` and `TodoRoutes`. Add `Layer` when the role alone is ambiguous.

The app chooses the database and crypto implementations. `Layer.provide` keeps them internal to the repository wiring. Use `Layer.provideMerge` when another consumer also needs a provided service. See the [repository](../catalogs/official/templates/package-db-todo-repository/src/TodoRepository.ts) and [app Layer](../catalogs/official/templates/server-todo-repository/src/Services/TodoRepository.ts).

```ts
export const TodoRepositoryLayer = TodoRepository.layer.pipe(
  Layer.provide([DatabaseLayer, PlatformCryptoLayer]),
);
```

Expose the operations and observations that callers need. The [Presence service](../catalogs/official/templates/package-presence-service/src/services/PresenceService.ts) exposes a stream of events and owns the `PubSub` internally.

Declare a named `Config.all` at module scope and read it when building the feature Layer. Give shared settings one owner. The [upstream GraphQL route](../catalogs/labs/templates/server-graphql-client/src/api/UpstreamItems.ts) owns its optional URL and uses the [server port config](../catalogs/official/templates/server/src/ServerConfig.ts).

## Schemas and handlers

Use `Schema.Struct` with a derived type for ordinary records. Brand IDs where their types must stay distinct. Use `Schema.Opaque` when the whole record needs a distinct construction boundary. See the [Todo schemas](../catalogs/official/templates/domain-todo-contracts/src/Todo.ts).

Get shared services when building the handler Layer. Get request-specific services inside the handler. An argument-free operation can be exposed as a lazy Effect value. See the [Todo HTTP handlers](../catalogs/official/templates/server-http-api-todos/src/Api/Todo.ts).

```ts
return handlers
  .handle("list", () => todos.list)
  .handle("get", ({ params }) => todos.get(params.id));
```

Use the adapter schema for straightforward representation changes. Keep business decisions in the operation. The [Todo row codec](../catalogs/official/templates/package-db-todo-repository/src/TodoRepository.ts) reads SQLite's integer as a boolean. The create operation still decides that a new Todo starts incomplete.

```ts
const TodoRow = Todo.mapFields((fields) => ({
  ...fields,
  completed: Schema.BooleanFromBit,
}));
```

Handle a local validation failure with a guard next to the failing operation. Use a response mapping when several distinct typed errors need different responses. The [upstream GraphQL route](../catalogs/labs/templates/server-graphql-client/src/api/UpstreamItems.ts) returns 400 at the path decoder and maps lookup failures separately.

## Model phases and match them exhaustively

Use a tagged union for mutually exclusive phases. Keep independent fields separate. Handle an absent value with a guard when it reads clearly, then use exhaustive matching for a tagged union so a new tag requires a decision. See the [receipt form](../catalogs/labs/templates/client-foldkit-workflow-receipt/src/features/receipt.ts) and [receipt status handler](../catalogs/labs/templates/server-workflow-receipt/src/api/Receipt.ts).

```ts
const Submission = Schema.TaggedUnion({
  Idle: {},
  Starting: {},
  Failed: { message: Schema.NonEmptyString },
});
```

## Own shared state and background work

Use `Ref` when shared state coordinates fibers. A private `Map` is fine for simple synchronous state. Keep a reservation's acquire and release operations together in the service. Let the caller choose the scope that owns the work. See [ChatSessions](../catalogs/official/templates/server-chat-rpc/src/runtime/ChatSessions.ts).

Use an explicit owner scope for work that outlives a request. Use `FiberMap` when the owner needs keyed cancellation. The [managed chat runtime](../catalogs/labs/templates/server-chat-runtime-managed/src/runtime/ChatManagedRuntime.ts) registers generation fibers in its Layer scope, and ChatSessions rejects overlapping sends.

In a shutdown test, wait for an explicit start signal before closing the owner scope. Verify cleanup and any released resources. See the [managed chat regression fixture](../apps/cli/e2e/fixtures/chat-owner-scope.ts.txt).

```ts
yield* Deferred.await(generationStarted);
yield* Scope.close(ownerScope, Exit.void);
assert.equal(yield* Deferred.isDone(generationStopped), true);
```
