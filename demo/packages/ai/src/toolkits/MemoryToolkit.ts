import {
  Array as Arr,
  Effect,
  HashMap,
  Option,
  pipe,
  Ref,
  Schema,
  String,
} from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

const memorySetTool = Tool.make("memory_set", {
  description: String.stripMargin(`
    |Store a key-value pair in session memory. Overwrites existing keys.
    `),
  parameters: Schema.Struct({
    key: Schema.String,
    value: Schema.String,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

const memoryGetTool = Tool.make("memory_get", {
  description: String.stripMargin(`
    |Retrieve a value by key from session memory.
    `),
  parameters: Schema.Struct({
    key: Schema.String,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

const memoryListTool = Tool.make("memory_list", {
  description: String.stripMargin(`
    |List all keys in session memory.
    `),
  parameters: Tool.EmptyParams,
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

const memoryDeleteTool = Tool.make("memory_delete", {
  description: String.stripMargin(`
    |Remove a key from session memory.
    `),
  parameters: Schema.Struct({
    key: Schema.String,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

/**
 * Key-value scratchpad for agentic loops. Allows the model to persist
 * and retrieve facts across tool invocations within a single session.
 *
 * @module
 */
export const MemoryToolkit = Toolkit.make(
  memorySetTool,
  memoryGetTool,
  memoryListTool,
  memoryDeleteTool,
);

/** Backed by an in-memory HashMap Ref scoped to the layer lifetime. */
export const InMemoryToolkitLive = MemoryToolkit.toLayer(
  Effect.gen(function* () {
    const store = yield* Ref.make(HashMap.empty<string, string>());

    return {
      memory_set: (params) =>
        Ref.update(store, HashMap.set(params.key, params.value)).pipe(
          Effect.tap(() => Effect.logDebug(`Memory set: ${params.key}`)),
          Effect.map(() => `Stored "${params.key}"`),
        ),

      memory_get: (params) =>
        Ref.get(store).pipe(
          Effect.map((map) => HashMap.get(map, params.key)),
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(`Key "${params.key}" not found in memory`),
              onSome: Effect.succeed,
            }),
          ),
          Effect.tap(() => Effect.logDebug(`Memory get: ${params.key}`)),
        ),

      memory_list: () =>
        Ref.get(store).pipe(
          Effect.map((map) => Arr.fromIterable(HashMap.keys(map))),
          Effect.tap((keys) =>
            Effect.logDebug(`Memory list: ${keys.length} keys`),
          ),
          Effect.map(JSON.stringify),
        ),

      memory_delete: (params) =>
        Ref.modify(store, (map) =>
          HashMap.has(map, params.key)
            ? ([true, HashMap.remove(map, params.key)] as const)
            : ([false, map] as const),
        ).pipe(
          Effect.flatMap((deleted) =>
            deleted
              ? Effect.succeed(`Deleted "${params.key}"`)
              : Effect.fail(`Key "${params.key}" not found in memory`),
          ),
          Effect.tap(() => Effect.logDebug(`Memory delete: ${params.key}`)),
        ),
    };
  }),
);
