import { existsSync } from "node:fs";
import path from "node:path";

type PrdItem = {
  category?: string;
  description?: string;
  passes?: boolean;
  issueNumber?: number;
  url?: string;
};

type IssueState = {
  state: "OPEN" | "CLOSED";
  title: string;
  url: string;
};

const rootDir = process.cwd();
const prdPath = path.resolve(
  rootDir,
  process.env.RALPH_PRD_OUTPUT ?? ".ralph/prd.json",
);
const progressPath = path.resolve(rootDir, ".ralph/progress.md");
const repo = process.env.RALPH_ISSUE_REPO?.trim();
const dryRun = process.env.RALPH_ISSUE_UPDATE_DRY_RUN === "1";

ensureGhInstalled();

if (!existsSync(prdPath)) {
  throw new Error(`PRD file not found: ${prdPath}`);
}

const latestProgressEntry = await loadLatestProgressEntry(progressPath);
const prdItems = await loadPrdItems(prdPath);
const recentlyCompletedIssueNumbers = extractIssueNumbers(
  latestProgressEntry.text,
);

let updatedCount = 0;

for (const item of prdItems) {
  if (
    item.passes !== true ||
    typeof item.issueNumber !== "number" ||
    !recentlyCompletedIssueNumbers.has(item.issueNumber)
  ) {
    continue;
  }

  const issue = loadIssueState(item.issueNumber, repo);
  if (issue.state === "CLOSED") {
    continue;
  }

  const comment = buildClosingComment(item, latestProgressEntry.text);

  if (dryRun) {
    console.log(
      `[dry-run] Would close issue #${item.issueNumber}: ${issue.title}`,
    );
    console.log(comment);
    updatedCount += 1;
    continue;
  }

  closeIssue(item.issueNumber, comment, repo);
  console.log(`Closed issue #${item.issueNumber}: ${issue.title}`);
  updatedCount += 1;
}

console.log(
  dryRun
    ? `Dry run complete. ${updatedCount} issue(s) would be updated.`
    : `Updated ${updatedCount} GitHub issue(s).`,
);

function ensureGhInstalled() {
  const result = Bun.spawnSync({
    cmd: ["gh", "--version"],
    cwd: rootDir,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error("gh CLI is required for Ralph GitHub updates");
  }
}

async function loadPrdItems(filePath: string) {
  const content = await Bun.file(filePath).text();
  return JSON.parse(content) as Array<PrdItem>;
}

async function loadLatestProgressEntry(filePath: string) {
  if (!existsSync(filePath)) {
    return { text: "Completed in the Ralph loop." };
  }

  const content = await Bun.file(filePath).text();
  const entries = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));

  const latestEntry = entries.at(-1);
  if (!latestEntry) {
    return { text: "Completed in the Ralph loop." };
  }

  return { text: latestEntry.slice(2).trim() };
}

function extractIssueNumbers(text: string) {
  const matches = text.matchAll(/issue\s+#(\d+)/gi);
  const issueNumbers = new Set<number>();

  for (const match of matches) {
    const issueNumber = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(issueNumber)) {
      issueNumbers.add(issueNumber);
    }
  }

  return issueNumbers;
}

function loadIssueState(issueNumber: number, issueRepo?: string) {
  const args = [
    "issue",
    "view",
    String(issueNumber),
    "--json",
    "state,title,url",
  ];

  if (issueRepo) {
    args.push("--repo", issueRepo);
  }

  const result = Bun.spawnSync({
    cmd: ["gh", ...args],
    cwd: rootDir,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (result.exitCode !== 0) {
    const error = new TextDecoder().decode(result.stderr).trim();
    throw new Error(error || `Failed to load issue #${issueNumber}`);
  }

  const output = new TextDecoder().decode(result.stdout);
  return JSON.parse(output) as IssueState;
}

function closeIssue(issueNumber: number, comment: string, issueRepo?: string) {
  const args = [
    "issue",
    "close",
    String(issueNumber),
    "--reason",
    "completed",
    "--comment",
    comment,
  ];

  if (issueRepo) {
    args.push("--repo", issueRepo);
  }

  const result = Bun.spawnSync({
    cmd: ["gh", ...args],
    cwd: rootDir,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (result.exitCode !== 0) {
    const error = new TextDecoder().decode(result.stderr).trim();
    throw new Error(error || `Failed to close issue #${issueNumber}`);
  }
}

function buildClosingComment(item: PrdItem, progressSummary: string) {
  const description = item.description?.trim() || "Completed task";

  return [
    "Completed by the Ralph loop.",
    "",
    `PRD item: ${description}`,
    "",
    `Latest progress: ${progressSummary}`,
  ].join("\n");
}
