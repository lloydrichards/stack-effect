// The Labs pilot pins Effect because PersistedQueue is still unstable.
// @effect-diagnostics unstableApiUsage:off
import { SqliteLayer } from "@repo/db";
import { SummaryRequested, type SummaryResult } from "@repo/domain/SummaryJob";
import { Effect, Layer } from "effect";
import { PersistedQueue } from "effect/persistence";
import { SqlClient } from "effect/sql";

const makeQueue = () =>
  PersistedQueue.make({ name: "text-summary", schema: SummaryRequested });

const QueueStoreLayer = PersistedQueue.layerStoreSql().pipe(
  Layer.provide(SqliteLayer),
);
const QueueLayer = PersistedQueue.layer.pipe(
  Layer.provide(QueueStoreLayer),
  Layer.provideMerge(SqliteLayer),
);

export const enqueueSummary = Effect.fn("SummaryQueue.enqueue")(function* (
  job: typeof SummaryRequested.Type,
) {
  const queue = yield* makeQueue();
  return yield* queue.offer(job, { id: job.jobId });
}, Effect.provide(QueueLayer));

export const consumeSummary = Effect.fn("SummaryQueue.consume")(function* () {
  const queue = yield* makeQueue();
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS text_summary_results (
    job_id TEXT PRIMARY KEY,
    word_count INTEGER NOT NULL
  )`;

  return yield* queue.take((job) =>
    Effect.gen(function* () {
      const result: SummaryResult = {
        jobId: job.jobId,
        wordCount: job.text.split(/\s+/u).length,
      };
      yield* sql`INSERT INTO text_summary_results (job_id, word_count)
        VALUES (${result.jobId}, ${result.wordCount})
        ON CONFLICT (job_id) DO UPDATE SET word_count = excluded.word_count`;
      return result;
    }),
  );
}, Effect.provide(QueueLayer));
