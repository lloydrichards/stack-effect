import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS db_health (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  yield* sql`
    INSERT INTO db_health (id)
    VALUES (1)
    ON CONFLICT(id) DO UPDATE SET checked_at = now()
  `;
});
