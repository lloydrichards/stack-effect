import { Effect, Schema } from "effect";

export const ChatTurnOptions = Schema.Struct({});
export type ChatTurnOptions = typeof ChatTurnOptions.Type;

export const chatTurnOptionKeys = (
  ...keys: ReadonlyArray<keyof ChatTurnOptions>
) => keys;

export class UnsupportedChatTurnOption extends Schema.TaggedError<UnsupportedChatTurnOption>()(
  "UnsupportedChatTurnOption",
  { message: Schema.String },
) {}

export const validateChatTurnOptions = (
  options: ChatTurnOptions,
  supported: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeEffect(ChatTurnOptions, {
      onExcessProperty: "error",
    })(options);
    const unsupported = Object.keys(decoded).filter(
      (key) => !supported.includes(key),
    );
    if (unsupported.length > 0)
      return yield* new UnsupportedChatTurnOption({
        message: `Unsupported chat options: ${unsupported.join(", ")}`,
      });
    return {};
  });
