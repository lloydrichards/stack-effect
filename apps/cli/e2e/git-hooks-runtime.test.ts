import { describe, expect, it } from "vitest";
import {
  advertisedRuntimeCells,
  runProviderCommitAcceptance,
} from "./git-hooks-runtime-harness";

describe.sequential("provider-native real-commit release acceptance", () => {
  it("enumerates every advertised provider/runtime/package-manager/tool cell", () => {
    expect(advertisedRuntimeCells).toHaveLength(30);
    expect(
      advertisedRuntimeCells.filter(({ provider }) => provider === "lefthook"),
    ).toHaveLength(18);
    expect(
      advertisedRuntimeCells.filter(({ provider }) => provider === "husky"),
    ).toHaveLength(12);
  });

  for (const cell of advertisedRuntimeCells) {
    it(`${cell.provider} ${cell.runtime}/${cell.packageManager} ${cell.quality}`, async () => {
      const verdict = await runProviderCommitAcceptance(cell);
      expect(verdict.canonicalVerdict).toBe("PASS");
      expect(verdict.success.headAdvanced).toBe(true);
      if (verdict.qualityEvidence.kind === "formatter-present") {
        expect(verdict.qualityEvidence.before).not.toBe(
          verdict.qualityEvidence.committed,
        );
        expect(verdict.qualityEvidence.worktree).toBe(
          verdict.qualityEvidence.committed,
        );
        expect(verdict.qualityEvidence.commit).toBe(
          verdict.qualityEvidence.headAfter,
        );
      } else {
        expect(verdict.qualityEvidence.outputLine).toContain(
          verdict.qualityEvidence.taskEvidence,
        );
        expect(verdict.qualityEvidence.committed).toBe(
          verdict.qualityEvidence.before,
        );
        expect(verdict.qualityEvidence.worktree).toBe(
          verdict.qualityEvidence.before,
        );
        expect(verdict.qualityEvidence.headAfter).not.toBe(
          verdict.qualityEvidence.headBefore,
        );
      }
      expect(verdict.failure.exitCode).not.toBe(0);
      expect(verdict.failure.headAfter).toBe(verdict.failure.headBefore);
      expect(verdict.failure.indexInventory).toEqual([
        `A\t${verdict.failure.path}`,
      ]);
      expect(verdict.failure.worktreeInventory).toEqual([]);
      expect(verdict.failure.indexContent).toBe(
        verdict.failure.expectedContent,
      );
      expect(verdict.partialStage.indexInventory).toEqual([]);
      expect(verdict.partialStage.worktreeInventory).toEqual([
        `M\t${verdict.partialStage.path}`,
      ]);
      expect(verdict.partialStage.committedContent).toBe(
        verdict.partialStage.expectedCommittedContent,
      );
      expect(verdict.partialStage.worktreeContent).toBe(
        verdict.partialStage.expectedWorktreeContent,
      );
      expect(verdict.partialStage.committedContent).not.toContain(
        "userWorktree",
      );
      expect(verdict.hookOrder).toEqual(
        cell.hasFormat && cell.hasLint
          ? ["format", "lint"]
          : cell.hasFormat
            ? ["format"]
            : ["lint"],
      );
      expect(verdict.cleanup.rootRemoved).toBe(true);
      if (cell.provider === "lefthook" && cell.packageManager === "pnpm") {
        expect(verdict.lefthookAllowBuildsSufficient).toBe(true);
      }
      if (cell.provider === "husky") {
        expect(verdict.husky?.initialCommitMarker).toBeLessThan(
          verdict.husky?.installMarker ?? -1,
        );
        expect(verdict.husky?.initialCommitSegment).not.toMatch(/lint-staged/i);
        expect(verdict.husky?.laterCommitHookEvidence).toMatch(
          /(?:npm|pnpm) run git-hooks:(?:format|lint) --/,
        );
        expect(verdict.husky?.prepareUnchanged).toBe(true);
        expect(verdict.husky?.installerOwnedHooksPath).toMatch(/^\.husky\/_$/);
      }
    }, 180_000);
  }
});
