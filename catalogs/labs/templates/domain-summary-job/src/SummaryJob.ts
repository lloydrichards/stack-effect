import { Schema } from "effect";

export const SummaryJobId = Schema.Trimmed.check(Schema.isNonEmpty()).pipe(
  Schema.brand("SummaryJobId"),
);
export type SummaryJobId = typeof SummaryJobId.Type;

export const SummaryRequested = Schema.Struct({
  jobId: SummaryJobId,
  text: Schema.Trimmed.check(Schema.isNonEmpty()),
});
export type SummaryRequested = typeof SummaryRequested.Type;

export type SummaryResult = {
  readonly jobId: SummaryJobId;
  readonly wordCount: number;
};
