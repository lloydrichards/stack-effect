import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const BUN = "/home/andresdavid/.local/share/mise/installs/bun/1.2.21/bin/bun";
const CLI = resolve(import.meta.dirname, "../src/index.ts");
const target = "package/domain:domain-api-contracts";

type Provider = "lefthook" | "husky";
type PackageManager = "bun" | "npm" | "pnpm";
type Quality =
  | "biome-format"
  | "oxfmt"
  | "biome-lint"
  | "oxlint"
  | "biome-combined"
  | "oxc-combined";

export interface RuntimeCell {
  readonly provider: Provider;
  readonly runtime: "bun" | "node";
  readonly packageManager: PackageManager;
  readonly quality: Quality;
  readonly hasFormat: boolean;
  readonly hasLint: boolean;
  readonly args: ReadonlyArray<string>;
}

const qualities: ReadonlyArray<
  Omit<RuntimeCell, "provider" | "runtime" | "packageManager">
> = [
  {
    quality: "biome-format",
    hasFormat: true,
    hasLint: false,
    args: ["--format", "biome", "--lint", "none"],
  },
  {
    quality: "oxfmt",
    hasFormat: true,
    hasLint: false,
    args: ["--format", "oxfmt", "--lint", "none"],
  },
  {
    quality: "biome-lint",
    hasFormat: false,
    hasLint: true,
    args: ["--format", "none", "--lint", "biome"],
  },
  {
    quality: "oxlint",
    hasFormat: false,
    hasLint: true,
    args: ["--format", "none", "--lint", "oxlint"],
  },
  {
    quality: "biome-combined",
    hasFormat: true,
    hasLint: true,
    args: ["--format", "biome", "--lint", "biome"],
  },
  {
    quality: "oxc-combined",
    hasFormat: true,
    hasLint: true,
    args: ["--format", "oxfmt", "--lint", "oxlint"],
  },
];

const providers = [
  {
    provider: "lefthook" as const,
    runtime: "bun" as const,
    packageManager: "bun" as const,
  },
  {
    provider: "lefthook" as const,
    runtime: "node" as const,
    packageManager: "npm" as const,
  },
  {
    provider: "lefthook" as const,
    runtime: "node" as const,
    packageManager: "pnpm" as const,
  },
  {
    provider: "husky" as const,
    runtime: "node" as const,
    packageManager: "npm" as const,
  },
  {
    provider: "husky" as const,
    runtime: "node" as const,
    packageManager: "pnpm" as const,
  },
];

export const advertisedRuntimeCells: ReadonlyArray<RuntimeCell> =
  providers.flatMap((provider) =>
    qualities.map((quality) => ({ ...provider, ...quality })),
  );

interface Result {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
const execute = (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
): Result => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dirname(BUN)}:${process.env["PATH"] ?? ""}`,
      GIT_AUTHOR_NAME: "Stack Effect Runtime Acceptance",
      GIT_AUTHOR_EMAIL: "runtime@example.invalid",
      GIT_COMMITTER_NAME: "Stack Effect Runtime Acceptance",
      GIT_COMMITTER_EMAIL: "runtime@example.invalid",
      CI: "1",
    },
    timeout: 170_000,
  });
  return {
    code: result.status ?? 128,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? String(result.error ?? ""),
  };
};
const must = (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
  label: string,
) => {
  const result = execute(cwd, command, args);
  if (result.code !== 0)
    throw new Error(
      `${label} failed (${result.code})\n${result.stdout}\n${result.stderr}`,
    );
  return result;
};
const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  must(cwd, "git", args, `git ${args.join(" ")}`).stdout.trim();
const inventory = (cwd: string, cached: boolean) =>
  execute(cwd, "git", [
    "diff",
    ...(cached ? ["--cached"] : []),
    "--name-status",
  ])
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
const write = (root: string, path: string, content: string) => {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
};

interface FormatterRuntimeVerdict {
  kind: "formatter-present";
  before: string;
  committed: string;
  worktree: string;
  commit: string;
  headAfter: string;
}

interface LinterOnlyRuntimeVerdict {
  kind: "linter-only";
  taskEvidence: string;
  outputLine: string;
  before: string;
  committed: string;
  worktree: string;
  headBefore: string;
  headAfter: string;
}

export interface RuntimeVerdict {
  canonicalVerdict: "PASS";
  success: { headAdvanced: true };
  qualityEvidence: FormatterRuntimeVerdict | LinterOnlyRuntimeVerdict;
  failure: {
    path: string;
    exitCode: number;
    headBefore: string;
    headAfter: string;
    indexInventory: ReadonlyArray<string>;
    worktreeInventory: ReadonlyArray<string>;
    indexContent: string;
    expectedContent: string;
  };
  partialStage: {
    path: string;
    indexInventory: ReadonlyArray<string>;
    worktreeInventory: ReadonlyArray<string>;
    committedContent: string;
    worktreeContent: string;
    expectedCommittedContent: string;
    expectedWorktreeContent: string;
  };
  hookOrder: ReadonlyArray<"format" | "lint">;
  lefthookAllowBuildsSufficient: boolean;
  husky?: {
    initialCommitMarker: number;
    installMarker: number;
    initialCommitSegment: string;
    laterCommitHookEvidence: string;
    prepareUnchanged: boolean;
    installerOwnedHooksPath: string;
  };
  cleanup: { rootRemoved: boolean };
}

export const runProviderCommitAcceptance = async (
  cell: RuntimeCell,
): Promise<RuntimeVerdict> => {
  const outer = mkdtempSync(join(tmpdir(), "stack-effect-hook-runtime-"));
  const name = `accept-${cell.provider}-${cell.packageManager}-${cell.quality}`;
  const root = join(outer, name);
  let verdict: RuntimeVerdict | undefined;
  try {
    const generated = must(
      outer,
      BUN,
      [
        "run",
        CLI,
        "create",
        name,
        "--target",
        target,
        "--yes",
        "--trust",
        "--root",
        outer,
        "--runtime",
        cell.runtime,
        "--package-manager",
        cell.packageManager,
        "--typescript",
        "7",
        "--git-hooks",
        cell.provider,
        ...cell.args,
      ],
      "generate",
    );
    const initialHead = git(root, "rev-parse", "HEAD");
    const packageJson = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    );
    const prepareUnchanged =
      packageJson.scripts.prepare === "effect-tsgo patch";
    const hooksPath = execute(root, "git", [
      "config",
      "--get",
      "core.hooksPath",
    ]).stdout.trim();
    const allowBuilds =
      cell.packageManager !== "pnpm" ||
      cell.provider !== "lefthook" ||
      readFileSync(join(root, "pnpm-workspace.yaml"), "utf8").includes(
        "lefthook: true",
      );

    const nested = "packages/domain/src/runtime acceptance/file with spaces.ts";
    write(root, nested, "export const clean = true;\n");
    git(root, "add", nested);
    const successRun = execute(root, "git", [
      "commit",
      "-m",
      "runtime success",
    ]);
    if (successRun.code !== 0)
      throw new Error(
        `success commit failed\n${successRun.stdout}\n${successRun.stderr}`,
      );
    const successHead = git(root, "rev-parse", "HEAD");

    const mutation = "packages/domain/src/runtime-acceptance-mutation.ts";
    const mutationBefore = "export const mutation={nested:true}\n";
    write(root, mutation, mutationBefore);
    git(root, "add", mutation);
    const mutationHeadBefore = git(root, "rev-parse", "HEAD");
    const mutationRun = execute(root, "git", [
      "commit",
      "-m",
      cell.hasFormat ? "runtime mutation" : "runtime lint",
    ]);
    if (mutationRun.code !== 0)
      throw new Error(
        `mutation commit failed\n${mutationRun.stdout}\n${mutationRun.stderr}`,
      );
    const mutationHead = git(root, "rev-parse", "HEAD");
    const mutationCommit = git(root, "log", "-1", "--format=%H");
    const committedMutation = `${git(root, "show", `HEAD:${mutation}`)}\n`;
    const worktreeMutation = readFileSync(join(root, mutation), "utf8");
    const expectedLintTaskEvidence =
      cell.provider === "lefthook"
        ? "lint ❯"
        : `${cell.packageManager} run git-hooks:lint --`;
    const lintOutputLine = `${mutationRun.stdout}\n${mutationRun.stderr}`
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.includes(expectedLintTaskEvidence));
    if (
      worktreeMutation !== committedMutation ||
      mutationCommit !== mutationHead ||
      (cell.hasFormat && committedMutation === mutationBefore) ||
      (!cell.hasFormat &&
        (committedMutation !== mutationBefore ||
          mutationHead === mutationHeadBefore ||
          lintOutputLine === undefined))
    )
      throw new Error(
        `quality evidence was not observed\nbefore=${JSON.stringify(mutationBefore)}\ncommitted=${JSON.stringify(committedMutation)}\nworktree=${JSON.stringify(worktreeMutation)}\nexpectedLintTaskEvidence=${JSON.stringify(expectedLintTaskEvidence)}\noutput=${JSON.stringify(`${mutationRun.stdout}\n${mutationRun.stderr}`)}`,
      );

    const failure = "packages/domain/src/runtime acceptance/non fixable.ts";
    const failureContent = "export const broken: = 1;\n";
    write(root, failure, failureContent);
    git(root, "add", failure);
    const beforeFailure = git(root, "rev-parse", "HEAD");
    const failureRun = execute(root, "git", ["commit", "-m", "must fail"]);
    const failureHead = git(root, "rev-parse", "HEAD");
    if (failureRun.code === 0 || failureHead !== beforeFailure)
      throw new Error("non-fixable task did not block HEAD");
    const failureIndex = inventory(root, true);
    const failureWorktree = inventory(root, false);
    const failureIndexContent = `${git(root, "show", `:${failure}`)}\n`;
    if (
      failureIndex.join("\n") !== `A\t${failure}` ||
      failureWorktree.length !== 0 ||
      failureIndexContent !== failureContent
    )
      throw new Error(
        "failed commit did not preserve the exact intended staged state",
      );
    git(root, "reset", "--hard", "HEAD");

    const partial = "packages/domain/src/runtime acceptance/partial stage.ts";
    const partialStaged = "export const staged={value:1}\n";
    const partialCommittedExpected = cell.hasFormat
      ? "export const staged = { value: 1 };\n"
      : partialStaged;
    const partialWorktree = `${partialStaged}export const userWorktree = 'preserve me'\n`;
    const partialWorktreeExpected = `${partialCommittedExpected}export const userWorktree = 'preserve me'\n`;
    write(root, partial, partialStaged);
    git(root, "add", partial);
    write(root, partial, partialWorktree);
    const partialRun = execute(root, "git", [
      "commit",
      "-m",
      "runtime partial stage",
    ]);
    if (partialRun.code !== 0)
      throw new Error(
        `partial commit failed\n${partialRun.stdout}\n${partialRun.stderr}`,
      );
    const committedPartial = `${git(root, "show", `HEAD:${partial}`)}\n`;
    const worktreePartial = readFileSync(join(root, partial), "utf8");
    const partialIndex = inventory(root, true);
    const partialWorktreeInventory = inventory(root, false);
    if (
      committedPartial !== partialCommittedExpected ||
      worktreePartial !== partialWorktreeExpected ||
      partialIndex.length !== 0 ||
      partialWorktreeInventory.join("\n") !== `M\t${partial}`
    )
      throw new Error(
        "partial commit did not preserve exact index/worktree content",
      );

    const hookOutput = `${successRun.stdout}\n${successRun.stderr}\n${mutationRun.stdout}\n${mutationRun.stderr}`;
    const expectedOrder =
      cell.hasFormat && cell.hasLint
        ? (["format", "lint"] as const)
        : cell.hasFormat
          ? (["format"] as const)
          : (["lint"] as const);
    let cursor = -1;
    for (const task of expectedOrder) {
      const evidence =
        cell.provider === "lefthook"
          ? new RegExp(`(?:^|\\n)[^\\n]*${task}\\s+❯`, "m")
          : new RegExp(`(?:npm|pnpm) run git-hooks:${task} --`);
      const match = evidence.exec(hookOutput.slice(cursor + 1));
      if (match === null)
        throw new Error(
          `missing provider-native runtime order evidence for ${task}`,
        );
      cursor += match.index + match[0].length;
    }
    const initialCommitMarker = generated.stdout.indexOf("initial commit");
    const installMarker = generated.stdout.indexOf(
      `${cell.packageManager} run husky:install`,
    );
    const initialCommitSegment = generated.stdout.slice(
      initialCommitMarker,
      installMarker,
    );
    const laterCommitHookEvidence = hookOutput.match(
      /(?:npm|pnpm) run git-hooks:(?:format|lint) --[^\n]*/,
    )?.[0];
    if (
      cell.provider === "husky" &&
      (!hooksPath.startsWith(".husky/_") ||
        !prepareUnchanged ||
        initialCommitMarker < 0 ||
        installMarker <= initialCommitMarker ||
        /lint-staged/i.test(initialCommitSegment) ||
        laterCommitHookEvidence === undefined)
    )
      throw new Error("Husky lifecycle event ordering was not observed");
    if (!allowBuilds || successHead === initialHead)
      throw new Error(
        "provider install/build or real hook execution not proven",
      );

    verdict = {
      canonicalVerdict: "PASS",
      success: { headAdvanced: true },
      qualityEvidence: cell.hasFormat
        ? {
            kind: "formatter-present",
            before: mutationBefore,
            committed: committedMutation,
            worktree: worktreeMutation,
            commit: mutationCommit,
            headAfter: mutationHead,
          }
        : {
            kind: "linter-only",
            taskEvidence: expectedLintTaskEvidence,
            outputLine: lintOutputLine!,
            before: mutationBefore,
            committed: committedMutation,
            worktree: worktreeMutation,
            headBefore: mutationHeadBefore,
            headAfter: mutationHead,
          },
      failure: {
        path: failure,
        exitCode: failureRun.code,
        headBefore: beforeFailure,
        headAfter: failureHead,
        indexInventory: failureIndex,
        worktreeInventory: failureWorktree,
        indexContent: failureIndexContent,
        expectedContent: failureContent,
      },
      partialStage: {
        path: partial,
        indexInventory: partialIndex,
        worktreeInventory: partialWorktreeInventory,
        committedContent: committedPartial,
        worktreeContent: worktreePartial,
        expectedCommittedContent: partialCommittedExpected,
        expectedWorktreeContent: partialWorktreeExpected,
      },
      hookOrder: [...expectedOrder],
      lefthookAllowBuildsSufficient: allowBuilds,
      ...(cell.provider === "husky"
        ? {
            husky: {
              initialCommitMarker,
              installMarker,
              initialCommitSegment,
              laterCommitHookEvidence: laterCommitHookEvidence!,
              prepareUnchanged,
              installerOwnedHooksPath: hooksPath,
            },
          }
        : {}),
      cleanup: { rootRemoved: false },
    };
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
  return { ...verdict!, cleanup: { rootRemoved: true } };
};
