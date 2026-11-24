# Coding taste

Use these preferences when writing or reviewing TypeScript. The Todo HTTP API with SQLite is the reference for generated Effect code. Follow the [catalog workspace workflow](skills/catalog-workspace/SKILL.md) to try it. The [catalog authoring guide](../.okf/guides/catalog-authoring.md#effect-patterns-in-generated-code) describes the boundaries the example follows.

This guide covers how code reads. Two skills own structure:

- Use the [package design skill](skills/stack-effect-design/SKILL.md#lay-out-a-package) when you add or move a module, package, `exports` subpath, or internal module. It owns package layout and where contracts live.
- Use the [testing skill](skills/stack-effect-testing/SKILL.md) for test design, test file placement and naming, and generated-project verification.

These rules apply to generated catalog code and to repository packages such as `packages/scaffold`. Where the two differ, a section says so under "In generated code" or "In repo packages".

## Repo form at a glance

| Instead of | Write |
| --- | --- |
| `throw new SomeError(...)` inside `Effect.gen` or `Effect.fn` | `return yield* new SomeError(...)` |
| A literal union such as `"create" \| "modify"` repeated in several places | One `Schema.Literals` with a derived type |
| A camelCase limit with its value repeated in messages | One `SCREAMING_SNAKE_CASE` constant that the check and the message both use |
| `switch (value._tag)` inside Effect code | `Match.valueTags`. An exhaustive `switch` on a plain string is fine |
| A `function` helper declared below its caller | An arrow `const` declared before the code that uses it |
| JSDoc that restates the function name | A `//` comment on the constraint, next to the line it constrains. Public modules carry fuller docs; see Public module docs |
| A reusable service Layer that provides its own crypto or filesystem | Leave the platform service as a requirement. The app or entry point provides it |
| `const out = []` filled by `push` in a loop | One expression: `map`, `filter`, `flatMap`, `Map.groupBy`, or a spread of conditional parts |
| `for (const x of xs) yield* step(x)` that collects or discards results | `yield* Effect.forEach(xs, step)` with `step` a named operation |
| `const fail = (message, cause) => new XError({ message, cause })` | `new XError({ message, cause })` at the step that fails |
| `if (a && !b) return yield* new XError(…)` to reject a combination of fields | A tagged union or a `.check` on the schema, so the combination cannot be built |
| `x.field ?? "default"` at each reader | `Schema.withDecodingDefaultKey` on the field, so the decoded type is total |
| `JSON.stringify([a, b])` or `` `${a}::${b}` `` as an equality key | `Equal`, `Arr.dedupe`, or a named `Equivalence` |
| `.sort((a, b) => a.localeCompare(b))` | `.sort(Order.String)`, or an `Order` built with `Order.mapInput` |
| `{ _tag: "x" } satisfies T` or `"x" as const` | The union's constructor, or a declared return type |

## Decide what is a service

- Make a service when code owns a dependency, such as I/O, a platform service, or another service, or owns a lifecycle, such as a scope, fibers, or shared state. Put pure logic in a module of exported functions named after the concept, such as `PlanAssessment.assess`. A test's wish to substitute an implementation is not a reason; test through the real owner. This follows Effect's own definition: Layers "manage dependencies during construction rather than at the service level."
- Give exported functions and public service operations `R = never`. Yield dependencies when building the Layer and close over them. Keep a requirement visible only when callers own it on purpose, such as `Scope` for an operation the caller scopes, and say why in a comment.
- Delete a service or function that only forwards to another. Callers use the owner. When several callers need the same sequence of the owner's operations, add that sequence to the owner as a named operation.
- Write one operation and preview it by running the same operation against a memory filesystem that the caller provides. When a preview must not perform the effect at all, such as spawning processes, split the work into an operation that returns what would happen as data and one that executes it. Do not pass a run or preview mode flag.
- Handle expected platform outcomes with Effect's own API: `Effect.catchReason("PlatformError", "NotFound", () => Effect.succeedNone)` for absence, and `FileSystem.lstat` for symbolic links. Write a helper or adapter only when it hides a decision the library does not make for you.
- Name a service with an agent noun for its role, as Effect does with `Logger`, `Tracer`, and `Clock`: `Planner`, `Applier`, `CatalogLoader`, or `RepositoryState`. Do not add a `Service` suffix. The module path names the concept, and the domain schema owns the phase noun, so `Planner` in `@repo/scaffold/Plan` builds a `Plan`. Name a pure module after its concept and import it as a namespace, as in `PlanAssessment.assess`. Avoid suffixes that name the kind of thing rather than its job, such as `Engine`, `Manager`, or `Helper`. Spell a word the same way everywhere: `Repository`, not `Repo`. Name an operation that requires the caller's `Scope` with a `Scoped` suffix, as Effect does with `forkScoped`, and as in `reserveScoped`. Name the effect an entry point passes to `runMain` `main`.

## Keep the operation readable

- Let the main operation read in execution order. Use blank lines between distinct stages such as dependency lookup, decoding, the operation, and handling its result. Keep each guard next to the value it checks.
- Build a collection as one expression: `map`, `filter`, `flatMap`, `Map.groupBy` or `Arr.groupBy`, `Record.fromEntries`, or a spread of conditional parts. Split cases with the union's guard, as in `attempts.filter(isCreated)`, not a `switch` that pushes into buckets. Seed an empty array, `Map`, or `Set` and fill it in a loop only when a step reads what earlier steps produced, such as a worklist, a first-wins dedupe, or ordered operations of different kinds. Use `reduce` only to fold to a single value, never with a collection seed.
- Use native array methods by default. Use Effect's `Array` module for `Option`-returning lookups, structural-equality helpers such as `dedupe` and `dedupeWith`, and data-last steps inside a `pipe`. `Arr.partition` takes a `Result`-returning function in v4, and `Arr.partitionMap` no longer exists.
- Iterate effects with `Effect.forEach(items, step)`, adding `{ discard: true }` when the results are not needed. `step` is an existing operation or a named `Effect.fnUntraced`. Keep `for…of` with `yield*` for early exit, state carried between items, or worklists. Flatten nested iteration into the pairs you visit with `flatMap`, or move the inner level into the named step. Keep at most three levels of nested blocks.
- Keep a workflow in one function unless a part needs to compose independently or has a real second caller. The [GitHub webhook](../catalogs/labs/templates/server-github-issue-label/src/webhooks/github.ts) keeps signature parsing, the bounded body read, and verification together before decoding the event. Split a function that Fallow marks complex when its parts are checks or formats you can name separately, such as one `…Issues` function per validation concern. Do not split a linear workflow only to lower the score.
- Give each public service operation a span named `Owner.operation`. Use `Effect.fn("Owner.operation")` when it has a generator body. End the pipeline with `Effect.withSpan("Owner.operation")` when it is an argument-free Effect value or a one-expression function. Add argument-dependent attributes with `Effect.annotateCurrentSpan` inside the body. Use `Effect.fnUntraced` for private helpers, per-item work, and pure-module functions. Do not leave `Effect.fn` unnamed. Keep existing span names stable; change one only when you deliberately rename its owner or operation. Give a private step its own span only when it is a distinct I/O call that runs once per operation.
- Write sequential steps and branches inside `Effect.gen` or `Effect.fn`. Attach whole-effect behaviour such as timeout, retry, error mapping, recovery, spans, or provision with `.pipe` on an `Effect.gen`, or as extra arguments to `Effect.fn`, not `.pipe` on it. Keep step-specific error mapping or recovery next to the step it handles. Do not branch inside `flatMap` or nest an inline `gen` inside a combinator; pass a named step instead. See how the [Summary Queue](../catalogs/labs/templates/cli-persisted-queue/src/jobs/SummaryQueue.ts) provides its Layer for an entire operation.
- Return early for guards. Use `else` for peer branches that read as one decision.
- Keep numeric defaults and constraints next to their config or schema definitions. Put a shared policy value in a `SCREAMING_SNAKE_CASE` constant near the top of the file. The [WebFetch toolkit](../catalogs/labs/templates/package-ai-toolkit-webfetch/src/toolkits/WebFetchToolkit.ts) uses one limit for the length check and truncation.
- Write a total, pure calculation as a plain function that returns its value. Write a pure step that can fail with an expected error as `Effect.fnUntraced`, raising with `return yield*`. Inside a generator, write local synchronous work as plain statements. Use `Effect.sync` only to defer an outside side effect until the Effect runs. Do not use `Effect.suspend` for early returns.
- Wrap throwing synchronous calls inside Effect workflows with `Effect.try`. At a plain JavaScript boundary, keep native `try/catch` around the operation whose exception the adapter can handle. See the [math toolkit](../catalogs/official/templates/package-ai-toolkit-math/src/toolkits/MathToolkit.ts) and [receipt history adapter](../catalogs/labs/templates/workflow-receipt-client/src/lib/receipt-history.ts).
- Use Effect's module when it models the primitive: `Predicate` for type guards, `Order` for sorting, `Equal` and `Equivalence` for comparison, `Schema.fromJsonString` for JSON, `Path` and `Path.fromFileUrl` for paths, `Config` for the environment, `Clock` and `DateTime` for time, and `Random` for randomness. Effect's own guide says never to write helpers like `isRecord` or `isString`. Use the platform where Effect has no counterpart, such as `TextDecoder` for strict UTF-8 or `os.homedir`.
- Sort with a named `Order`, never `localeCompare` or a bare `.sort()` outside UI code, so identical inputs produce identical output. Compare and dedupe values with `Equal`, `Arr.dedupe`, or a named `Equivalence` with `Arr.dedupeWith` when identity is a subset of fields. Build a string key only when the string is itself a stored or displayed identity, such as `TargetIdentity.toKey()`.

## Shape a function

- Give a function at most four inputs, counting the fields of a destructured options object as inputs. When it needs more, the inputs belong to a domain value or a service: name that type instead of widening the bag.
- Bind a value that every step of an operation shares, such as a repository root or a source URL, once into a handle or domain value, as Effect derives a client with `HttpClient.mapRequest(HttpClientRequest.prependUrl(base))`. Helpers take the handle as one input. A helper closes over Layer-time services only; declare it at Layer or module scope, never inside an operation.
- Replace a boolean parameter that chooses behaviour with a literal union or tagged union that names each case, or with two operations. Decode command-line flags into that type once, in the command. A boolean that is data, such as `isLast` or a schema field, is fine.
- Construct an error inline with `new X({ … })` at the step that fails, so the call site names the class and its fields. Write a helper only when it computes something the call site cannot see, such as a message derived from structured data, and never curry one for point-free use. Make an error that many operations reuse unchanged a module constant.
- Inline a single-use helper that is shorter than its call. Delete a parameter or option that no production caller passes; a test is not a caller.

## Function and type syntax

Use arrow functions by default, including for named functions and components. Use `function` syntax when a feature requires it, such as overloads or a generator body. Use `type` for object shapes, unions, and derived types. Use `interface` when a feature such as declaration merging requires it. See the [MCP toolkit overloads](../catalogs/official/templates/chat-mcp/src/McpTools.ts) and [Vite environment declarations](../catalogs/official/templates/client-react/src/vite-env.d.ts).

Write relative imports without an extension. Import Effect modules by name from `"effect"`, using an `effect/…` subpath only for modules the root does not export. Import pure and internal modules as namespaces. Mark type-only imports with `import type`, or an inline `type` in mixed imports. `verbatimModuleSyntax` enforces this in repository workspaces. Generated workspaces don't enable it yet, so follow the rule there by hand.

Declare types where they define a contract: each export of a public module, service shapes, and recursive functions. Give a public generator function `Effect.fn.Return<A, E>` so its error union cannot widen silently. Infer internal-module exports, private helpers, locals, and Layer bodies.

Let a constructor or a declared type carry a literal. Build tagged values with the union's constructor, such as `X.cases.y.make(…)` for a Schema union or `Data.taggedEnum` for an internal one, and model an internal union with one of those instead of a hand-written `{ _tag: … } | …` type. Do not write `as const` on a single literal, `satisfies` on a return value, or a type annotation on a temporary only to pin a literal. `[…] as const` tuples that feed `Schema.Literals` and lookup tables that `satisfies Record<Union, T>` are fine.

Write `readonly` where it is part of a contract: service shapes and exported domain data that is not derived from a Schema. Leave it off component props, inline parameter types, and file-local types. Write a read-only array as `ReadonlyArray<T>`.

## Services and Layers

Declare the shape in the `Context.Service` generic. Build the implementation in `static readonly layer = Layer.effect(X, Effect.gen(…))` and return `X.of({ … })`. Add `make` only when several Layers share construction or construction takes arguments. Refer to the shape as `X["Service"]` instead of exporting a separate `XShape` type. This is the form in Effect's [service guide](../node_modules/effect/ai-docs/src/01_effect/03_services/01_service.ts) and the [Todo repository](../catalogs/official/templates/package-db-todo-repository/src/TodoRepository.ts).

`static readonly layer` wires everything the package owns and leaves open only what the app chooses: platform services such as FileSystem, Path, and crypto, and drivers such as SqlClient and HttpClient. Name variants for what differs, such as `layerMemory`, `layerDemo`, or `layerConfig`. Add `layerTest` only for a service that fronts an external system. This deliberately differs from Effect's [composition example](../node_modules/effect/ai-docs/src/01_effect/03_services/20_layer-composition.ts), where `layer` also picks the driver. Do not use `Live` or `Default`. Use PascalCase role names for standalone Layers, such as `TodoHandlers` and `TodoRoutes`. Add `Layer` when the role alone is ambiguous.

Qualify new service IDs by owning package, for example `@repo/db/TodoRepository`. Keep an existing ID stable; change it only when you deliberately rename or move the service, in the same change. Generated code keeps the Todo reference's `"TodoRepository"`.

The app chooses the database and crypto implementations. `Layer.provide` keeps them internal to the repository wiring. Use `Layer.provideMerge` when another consumer also needs a provided service. See the [repository](../catalogs/official/templates/package-db-todo-repository/src/TodoRepository.ts) and [app Layer](../catalogs/official/templates/server-todo-repository/src/Services/TodoRepository.ts).

```ts
export const TodoRepositoryLayer = TodoRepository.layer.pipe(
  Layer.provide([DatabaseLayer, PlatformCryptoLayer]),
);
```

Expose the operations and observations that callers need. The [Presence service](../catalogs/official/templates/package-presence-service/src/services/PresenceService.ts) exposes a stream of events and owns the `PubSub` internally.

Declare each feature's environment configuration in a named, module-level `Config.all({ … })`, even when it has one field. Read it when building the feature Layer or at the entry point. Keep defaults and secret redaction in that declaration so readers can scan the full set of settings. Give shared settings one owner. The [upstream GraphQL route](../catalogs/labs/templates/server-graphql-client/src/api/UpstreamItems.ts) owns its optional URL and uses the [server port config](../catalogs/official/templates/server/src/ServerConfig.ts).

## Schemas and handlers

Declare optional fields with `Schema.optional`, which gives `?: T | undefined`, and pass possibly-undefined values straight through. Use `Schema.optionalKey` with a conditional spread only when absent and `undefined` must stay distinct, and say why in a comment.

Make the decoded type total. Put a field's default in its decoding with `Schema.withDecodingDefaultKey`, and its normalization, such as trimming, in a schema such as `Schema.Trim`, so readers never repeat it with `??`, a cast, or `.trim()`. `Schema.withConstructorDefault` only fills values passed through `make`. Give a comparison rule, such as case-insensitive paths, one named `Equivalence`. Use `??` only for absence the code does not own, such as an optional terminal width.

Put an invariant that spans several fields on the type, so an invalid value cannot be decoded or constructed. Use a tagged union when the fields select a case, and `.check(Schema.makeFilter(…))` when they only constrain each other, with one filter per rule so each failure has its own message. Keep runtime checks for facts outside the value, such as the filesystem or the catalog, and write them as one exhaustive match on the union, not a `validate…` function that reads a mode string. Delete a `make…` helper that silently coerces an invalid combination.

Pair each schema that appears in a signature with a same-name type, `export type X = typeof X.Type`. A `Schema.Class` already is its type. Use the name in signatures. Do not write `typeof X.Type` inline, reach into `.fields`, or spell it `Schema.Schema.Type<typeof X>`. Export a named schema for any nested piece you need.

Do not rename a schema's type locally, as in `type Rows = typeof CounterHistory.Type`, and do not suffix a schema `Schema` to free its name for the type. If another name reads better, the schema is misnamed: rename it at its definition. A union that names a domain concept becomes its own schema.

Use `Schema.Struct` with a derived type for ordinary records. Use `Schema.Opaque` when the whole record needs a distinct construction boundary. See the [Todo schemas](../catalogs/official/templates/domain-todo-contracts/src/Todo.ts).

Brand every identifier, including IDs, keys, and graph node and edge IDs, and every path whose base matters, such as repo-relative versus absolute. Give each branded ID one constructor that owns its format. Create brands by decoding input at the boundary, and never `make` a raw string.

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

Give an error its own tag when a caller handles it differently, as with `TodoNotFound` becoming a 404. Otherwise fail with the operation's one error, carrying `message` and `cause`. When a caller needs to branch within that error, model the branches as a tagged reason union with structured fields and recover with `Effect.catchReason`, as in Effect's [reason errors example](../node_modules/effect/ai-docs/src/01_effect/04_errors/20_reason-errors.ts). Do not use a string-literal `reason`, and do not drop the cause.

Name errors as Effect does. Name an operation's error `<Operation>Error`, such as `ApplyError` or `CatalogLoadError`. Name a reason, or an error callers handle separately, for its condition, such as `TodoNotFound`, `StalePlan`, or `CatalogTimedOut`. Do not use a `Failure` suffix.

Write a message that names the failed action and its subject, such as `` `Could not write ${path}` ``. The `cause` says why. Do not interpolate `cause.message`, and do not repeat the phase that the error type already names, such as "during apply". The app's presenter prints the cause chain.

Recover from an error where the caller or adapter has enough context to decide what to do. Define errors with `Schema.TaggedError` and raise them with `return yield* new X({ … })`. Carry the original cause as `cause: Schema.Defect()`. Put an error in `@repo/domain`, next to the data it describes, when it appears in an operation another package calls. Keep an error that stays inside one module with that module.

Translate infrastructure failures into the reusable service's error vocabulary. Assign HTTP status codes in the HTTP contract. Keep HttpApi's default 400 for schema rejection. Use typed validation middleware when clients need a stable error body.

When an adapter decodes input manually, put the validation guard next to the decode. Use a response mapping when several distinct typed errors need different responses. The [upstream GraphQL route](../catalogs/labs/templates/server-graphql-client/src/api/UpstreamItems.ts) returns 400 at its manual path decoder and maps lookup failures separately.

## Model phases and match them exhaustively

Use a tagged union for mutually exclusive shapes wherever they appear: phases, intermediate data, and operation inputs. Keep independent fields separate. Decide the case once, where the information is known, and match it exhaustively downstream. Do not use a bag of optional fields with booleans re-derived later, an optional parameter that switches modes, or `!` to assert a case that the type does not record. See the [receipt form](../catalogs/labs/templates/client-foldkit-workflow-receipt/src/features/receipt.ts) and [receipt status handler](../catalogs/labs/templates/server-workflow-receipt/src/api/Receipt.ts).

Return `Option` from Effect APIs and public operations whose result may be absent. Inside a function, unwrap it with a guard such as `if (Option.isSome(x))` and raise errors with `return yield*`. Use `Option.match` only when both branches compute a value. Use `T | undefined` for optional fields and plain values. Do not use `null` sentinels, and do not write an `onNone` branch that cannot happen; fix the model instead.

Pick the matching form by shape:

- Match a tagged union once with `Match.valueTags`.
- Build a reusable matcher with `Match.typeTags`.
- Use `Match.value(...).pipe(Match.when(…), Match.exhaustive)` for predicates or partial patterns.
- Map a closed literal union to constant values with an object that `satisfies Record<Union, T>`.
- Use `Match.orElse` only for open inputs such as external data with unknown tags, and say why in a comment.
- To keep only some cases, filter with the union's guard, such as `deps.filter(ModuleDependency.guards["required-capability"])` or `ModuleDependency.isAnyOf([...])`. Exhaustive matching applies when every case gets a branch. A filter only narrows the list, so it is not a missing branch.

The [Todo atom](../catalogs/official/templates/client-react-http-api-todos/src/lib/atoms/todo-atom.ts) matches its commands. In plain TypeScript, an exhaustive `switch` is fine when its cases read better as statements. The [Presence reducer](../catalogs/official/templates/client-react-ws-presence/src/components/presence-panel.tsx) checks exhaustiveness with `satisfies never`.

```ts
yield* Match.valueTags(command, {
  list: () => Effect.void,
  create: ({ title }) =>
    Effect.asVoid(client.todos.create({ payload: { title } })),
  update: ({ id, title, completed }) =>
    Effect.asVoid(
      client.todos.update({ params: { id }, payload: { title, completed } }),
    ),
  delete: ({ id }) => Effect.asVoid(client.todos.delete({ params: { id } })),
});

const CONNECTOR_TEXT = {
  dashed: "╌>",
  solid: "─>",
  plain: "──",
} satisfies Record<Connector, string>;
```

## Own shared state and background work

Use `Ref` when shared state coordinates fibers. A private `Map` is fine for simple synchronous state. Keep a reservation's acquire and release operations together in the service. Let the caller choose the scope that owns the work. See [ChatSessions](../catalogs/official/templates/server-chat-rpc/src/runtime/ChatSessions.ts).

Use an explicit owner scope for work that outlives a request. Use `FiberMap` when the owner needs keyed cancellation. The [managed chat runtime](../catalogs/labs/templates/server-chat-runtime-managed/src/runtime/ChatManagedRuntime.ts) registers generation fibers in its Layer scope, and ChatSessions rejects overlapping sends.

## Comments and logs

Write a comment for a constraint the code cannot show. Do not narrate the next line, add section banners, or put JSDoc on a declaration that is not exported unless it states a constraint. A file that needs banners is several modules. Keep `// NOTE:` composition anchors in templates.

Do not log lifecycle or per-call progress, such as "Starting the RPC implementation" or a debug line per tool call; `Effect.fn` spans already record it. Log an event an operator acts on, with a fixed message and structured fields from `Effect.annotateLogs`, not an interpolated string. A line that tells the user where a server listens, and `Effect.logError` on a failure the code deliberately swallows, are fine.

## In generated code

- Return the resource or `void` from a success channel. Do not add a `success`, `ok`, or `status` flag; a failure goes in the error channel.
- Copy the shape of sibling templates, such as the other toolkits' export names, doc placement, and logging. When two templates would hold the same file, share one template between the modules.
- Pin each dependency version once, in a constant in the catalog source, not as a literal in each module.

## Public module docs

Open each public module with a header saying what it is for. Give each public export a one-line summary, a **When to use** section, and **Gotchas** when there are some. Add an **Example** when usage is not obvious from the signature. Do not add `@since`, `@category`, or `@stability`. Internal modules carry `/** @internal */` and constraint comments only. In generated code, keep comments to constraints.

Export only what another module uses in production code. A test is not a caller. Fallow enforces this in lint. The [package design skill](skills/stack-effect-design/SKILL.md#keep-exports-honest) says how to handle a finding Fallow cannot see.

## Lint that enforces taste

`bun lint` enforces these rules. Turn a rule on in the change that fixes its last violation, so the main branch always lints clean.

| Rule | Where | What it rejects |
| --- | --- | --- |
| `effecttsgo/global-date`, `global-random`, `crypto-random-uuid`, `process-env`, and `global-console`, each with its `-in-effect` form, plus `global-json-in-effect` | [`.oxlintrc.json`](../.oxlintrc.json) | A platform global where an Effect module models it. The docs server entry may write to the console |
| `effecttsgo/node-builtin-import` | `.oxlintrc.json` | A Node built-in import outside tests, `tools/`, and docs scripts. Use the platform service |
| `effecttsgo/effect-try-without-catch` | `.oxlintrc.json` | `Effect.try` without a `catch` that maps to a typed error |
| `unicorn/prefer-array-flat-map` | `.oxlintrc.json` | `.map(…).flat()` |
| Fallow complexity audit | `bun run lint:complexity` | A function that a change pushes over Fallow's complexity thresholds. Existing findings are reported, not gated |
