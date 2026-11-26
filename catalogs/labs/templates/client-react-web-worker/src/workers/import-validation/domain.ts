import { Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const ImportRecord = Schema.Struct({
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.check(Schema.isMinLength(1)),
});

const ImportLine = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

export const ImportValidationEvent = Schema.TaggedUnion({
  started: { total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) },
  accepted: { line: ImportLine },
  rejected: { line: ImportLine, issue: Schema.String },
  completed: {
    total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  },
});
export type ImportValidationEvent = typeof ImportValidationEvent.Type;

export class ImportValidationFailure extends Schema.TaggedError<
  ImportValidationFailure,
  { readonly brand: unique symbol }
>()("ImportValidationFailure", { message: Schema.String }) {}

export class ImportValidationRpc extends RpcGroup.make(
  Rpc.make("validate", {
    payload: { content: Schema.String },
    success: ImportValidationEvent,
    error: ImportValidationFailure,
    stream: true,
  }),
) {}

const decodeImportRecord = Schema.decodeOption(
  Schema.fromJsonString(ImportRecord),
);

export const parseImportRecord = (line: string, lineNumber: number) =>
  Option.isSome(decodeImportRecord(line))
    ? ImportValidationEvent.cases.accepted.make({ line: lineNumber })
    : ImportValidationEvent.cases.rejected.make({
        line: lineNumber,
        issue: "Expected a JSON object with a name and email address.",
      });
