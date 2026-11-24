import { DateTime, Effect, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/ai";

const getCurrentDatetimeTool = Tool.make("get_current_datetime", {
  description: String.stripMargin(`
    |Get the current date and time in a specified timezone.
    |Use IANA timezone identifiers (e.g. 'America/New_York', 'Europe/London', 'UTC').
  `),
  parameters: Schema.Struct({
    timezone: Schema.String,
  }),
  success: Schema.Struct({
    iso: Schema.DateTimeUtc,
    formatted: Schema.String,
    timezone: Schema.String,
    unix: Schema.Int,
  }),
  failure: Schema.String,
  failureMode: "return",
});

/** Gives the model the current time, which it cannot observe on its own. */
export const DateTimeToolkit = Toolkit.make(getCurrentDatetimeTool);

export const DateTimeToolkitHandlers = DateTimeToolkit.toLayer(
  Effect.succeed({
    get_current_datetime: (params) =>
      Effect.gen(function* () {
        const tz = params.timezone || "UTC";
        const now = yield* DateTime.now;
        const zoned = yield* Effect.fromOption(
          DateTime.setZoneNamed(now, tz),
        ).pipe(
          Effect.mapError(
            () => `Invalid timezone "${tz}": not a valid IANA timezone`,
          ),
        );

        return {
          iso: now,
          formatted: DateTime.format(zoned, {
            dateStyle: "full",
            timeStyle: "long",
          }),
          timezone: tz,
          unix: DateTime.toEpochMillis(now),
        };
      }),
  }),
);
