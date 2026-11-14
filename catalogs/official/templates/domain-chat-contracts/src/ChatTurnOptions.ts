import { ChatPreparationError } from "./Chat";
import { Effect, Schema } from "effect";

export const ChatTurnOptions = Schema.Struct({});
export type ChatTurnOptions = typeof ChatTurnOptions.Type;

export const chatTurnOptionKeys = (
  ...keys: ReadonlyArray<keyof ChatTurnOptions>
) => keys;

export class UnsupportedChatTurnOption extends Schema.TaggedError<
  UnsupportedChatTurnOption,
  { readonly brand: unique symbol }
>()("UnsupportedChatTurnOption", { message: Schema.String }) {}

export const validateChatTurnOptions = (
  options: ChatTurnOptions,
  supported: ReadonlyArray<keyof ChatTurnOptions>,
) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeEffect(ChatTurnOptions, {
      onExcessProperty: "error",
    })(options);
    const unsupported = Object.keys(decoded).filter(
      (key) => !supported.some((name) => name === key),
    );
    if (unsupported.length > 0)
      return yield* new UnsupportedChatTurnOption({
        message: `Unsupported chat options: ${unsupported.join(", ")}`,
      });
  }).pipe(
    Effect.mapError(
      (error) =>
        new ChatPreparationError({
          reason: {
            code: "invalid-input",
            message: error.message,
            source: "chat-options",
          },
        }),
    ),
  );
