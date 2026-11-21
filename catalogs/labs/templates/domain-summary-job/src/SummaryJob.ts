import { Schema } from "effect";

export const SummaryRequested = Schema.Struct({
  jobId: Schema.Trimmed.check(Schema.isNonEmpty()),
  text: Schema.Trimmed.check(Schema.isNonEmpty()),
});

export interface SummaryResult {
  readonly jobId: string;
  readonly wordCount: number;
}
