import {
  Array as Arr,
  Effect,
  HashMap,
  Option,
  Ref,
  Schema,
  String,
} from "effect";
import { Tool, Toolkit } from "effect/ai";

const MemoryKeysJson = Schema.fromJsonString(Schema.Array(Schema.String));

const memorySetTool = Tool.make("memory_set", {
  description: String.stripMargin(`
    |Store a key-value pair in the scratchpad. Overwrites existing keys.
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
    |Retrieve a value by key from the scratchpad.
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
    |List all keys in the scratchpad.
    `),
  parameters: Tool.EmptyParams,
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

const memoryDeleteTool = Tool.make("memory_delete", {
  description: String.stripMargin(`
    |Remove a key from the scratchpad.
    `),
  parameters: Schema.Struct({
    key: Schema.String,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

/** A key-value scratchpad that lasts as long as its Layer. */
export const MemoryToolkit = Toolkit.make(
  memorySetTool,
  memoryGetTool,
  memoryListTool,
  memoryDeleteTool,
);

export const MemoryToolkitHandlers = MemoryToolkit.toLayer(
  Effect.gen(function* () {
    const store = yield* Ref.make(HashMap.empty<string, string>());

    return {
      memory_set: (params) =>
        Ref.update(store, HashMap.set(params.key, params.value)).pipe(
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
        ),

      memory_list: () =>
        Ref.get(store).pipe(
          Effect.map((map) => Arr.fromIterable(HashMap.keys(map))),
          Effect.flatMap(Schema.encodeEffect(MemoryKeysJson)),
          Effect.orDie,
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
        ),
    };
  }),
);
