import { Effect } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

export const checkDatabaseHealth = Effect.gen(function* () {
  const sql = yield* SqlClient;
  const rows = yield* sql<{ ok: number }>`SELECT 1 AS ok`;
  return rows[0]?.ok === 1;
});
