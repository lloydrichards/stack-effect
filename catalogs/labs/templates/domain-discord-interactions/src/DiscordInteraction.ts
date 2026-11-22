import { Schema } from "effect";

export const DiscordPing = Schema.Struct({ type: Schema.Literal(1) });
export const DiscordPong = Schema.Struct({ type: Schema.Literal(1) });
