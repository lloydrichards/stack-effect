import { DateTime, Effect, Option, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

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
    unix: Schema.Number,
  }),
  failure: Schema.String,
  failureMode: "return",
});

/**
 * Provides the current date and time in a specified timezone.
 * Models have no access to real-time clocks, making this essential
 * for any time-aware agent behavior.
 *
 * @module
 */
export const DateTimeToolkit = Toolkit.make(getCurrentDatetimeTool);

export const DateTimeToolkitLive = DateTimeToolkit.toLayer(
  Effect.succeed({
    get_current_datetime: (params) =>
      Effect.gen(function* () {
        const tz = params.timezone || "UTC";
        const now = yield* DateTime.now;
        const zoned = yield* Option.match(DateTime.setZoneNamed(now, tz), {
          onNone: () =>
            Effect.fail(`Invalid timezone "${tz}": not a valid IANA timezone`),
          onSome: Effect.succeed,
        });

        yield* Effect.logDebug(`Getting current datetime for timezone: ${tz}`);

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
