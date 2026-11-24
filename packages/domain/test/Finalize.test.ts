import { assert, describe, it } from "@effect/vitest";
import { FinalizeReport } from "@repo/domain/Finalize";
import { Result } from "effect";

describe("FinalizeReport", () => {
  it("should count succeeded and failed scripts when a run has both", () => {
    const report = new FinalizeReport({
      results: [
        Result.succeed({ label: "install", command: "bun install" }),
        Result.fail({
          label: "lint",
          command: "bun run lint",
          error: "exit 1",
        }),
        Result.succeed({ label: "format", command: "bun run format" }),
      ],
    });

    assert.strictEqual(report.succeeded, 2);
    assert.strictEqual(report.failed, 1);
  });
});
