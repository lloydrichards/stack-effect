import { Effect, Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export const ImportRecord = Schema.Struct({
  email: Schema.String.check(
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  ),
  name: Schema.String.check(Schema.isMinLength(1)),
});

export const ImportIssue = Schema.Struct({
  line: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  message: Schema.String,
});

export const ImportValidationEvent = Schema.TaggedUnion({
  started: { total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) },
  row: {
    accepted: Schema.Boolean,
    line: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    issue: Schema.optional(ImportIssue),
  },
  completed: {
    total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  },
});

export class ImportValidationFailure extends Schema.TaggedError<ImportValidationFailure>()(
  "ImportValidationFailure",
  { message: Schema.String },
) {}

export class ImportValidationRpc extends RpcGroup.make(
  Rpc.make("validate", {
    payload: { content: Schema.String },
    success: ImportValidationEvent,
    error: ImportValidationFailure,
    stream: true,
  }),
) {}

export const parseImportRecord = (line: string, lineNumber: number) =>
  Effect.sync(() => {
    const parsed = Schema.decodeOption(Schema.fromJsonString(Schema.Unknown))(
      line,
    );
    return Option.match(parsed, {
      onNone: () => ({
        accepted: false,
        line: lineNumber,
        issue: {
          line: lineNumber,
          message: "Expected a JSON object with a name and email address.",
        },
      }),
      onSome: (value) =>
        Schema.decodeUnknownOption(ImportRecord)(value).pipe(
          Option.match({
            onNone: () => ({
              accepted: false,
              line: lineNumber,
              issue: {
                line: lineNumber,
                message:
                  "Expected a JSON object with a name and email address.",
              },
            }),
            onSome: () => ({ accepted: true, line: lineNumber }),
          }),
        ),
    });
  });
