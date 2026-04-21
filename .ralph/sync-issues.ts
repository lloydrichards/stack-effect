import { existsSync } from "node:fs";
import path from "node:path";

type Issue = {
  number: number;
  title: string;
  body: string;
  url: string;
  labels?: Array<{ name?: string }>;
};

type PrdItem = {
  category: "github-issue";
  description: string;
  steps: Array<string>;
  passes: boolean;
  issueNumber: number;
  url: string;
  labels: Array<string>;
  blockedBy: Array<number>;
};

const rootDir = process.cwd();
const outputPath = path.resolve(
  rootDir,
  process.env.RALPH_PRD_OUTPUT ?? ".ralph/prd.json",
);

const issueState = process.env.RALPH_ISSUE_STATE ?? "open";
const issueLimit = Number.parseInt(process.env.RALPH_ISSUE_LIMIT ?? "100", 10);
const issueRepo = process.env.RALPH_ISSUE_REPO?.trim();
const issueLabels = (process.env.RALPH_ISSUE_LABELS ?? "")
  .split(",")
  .map((label) => label.trim())
  .filter(Boolean);

if (!Number.isFinite(issueLimit) || issueLimit < 1) {
  throw new Error("RALPH_ISSUE_LIMIT must be a positive integer");
}

ensureGhInstalled();

const existingPasses = await loadExistingPasses(outputPath);
const issues = await loadIssues({
  issueLimit,
  issueRepo,
  issueState,
});

const filteredIssues = issues
  .filter((issue) => matchesLabels(issue, issueLabels))
  .sort((left, right) => left.number - right.number);

const prdItems = filteredIssues.map((issue) =>
  toPrdItem(issue, existingPasses),
);

await Bun.write(outputPath, `${JSON.stringify(prdItems, null, 2)}\n`);

const labelSummary =
  issueLabels.length > 0 ? ` with labels: ${issueLabels.join(", ")}` : "";
console.log(
  `Synced ${prdItems.length} issue(s) from GitHub ${issueState}${labelSummary} to ${path.relative(rootDir, outputPath)}`,
);

function ensureGhInstalled() {
  const result = Bun.spawnSync({
    cmd: ["gh", "--version"],
    cwd: rootDir,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error("gh CLI is required for Ralph issue sync");
  }
}

async function loadExistingPasses(filePath: string) {
  if (!existsSync(filePath)) {
    return new Map<number, boolean>();
  }

  const file = Bun.file(filePath);
  const content = await file.text();
  if (!content.trim()) {
    return new Map<number, boolean>();
  }

  const parsed = JSON.parse(content) as Array<Partial<PrdItem>>;
  const passesByIssueNumber = new Map<number, boolean>();

  for (const item of parsed) {
    if (
      typeof item.issueNumber === "number" &&
      typeof item.passes === "boolean"
    ) {
      passesByIssueNumber.set(item.issueNumber, item.passes);
    }
  }

  return passesByIssueNumber;
}

async function loadIssues(options: {
  issueLimit: number;
  issueRepo?: string;
  issueState: string;
}) {
  const args = [
    "issue",
    "list",
    "--state",
    options.issueState,
    "--limit",
    String(options.issueLimit),
    "--json",
    "number,title,body,labels,url",
  ];

  if (options.issueRepo) {
    args.push("--repo", options.issueRepo);
  }

  const result = Bun.spawnSync({
    cmd: ["gh", ...args],
    cwd: rootDir,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (result.exitCode !== 0) {
    const error = new TextDecoder().decode(result.stderr).trim();
    throw new Error(error || "Failed to load GitHub issues");
  }

  const output = new TextDecoder().decode(result.stdout);
  return JSON.parse(output) as Array<Issue>;
}

function matchesLabels(issue: Issue, requiredLabels: Array<string>) {
  if (requiredLabels.length === 0) {
    return true;
  }

  const issueLabels = new Set(
    (issue.labels ?? [])
      .map((label) => label.name?.trim())
      .filter((label): label is string => Boolean(label)),
  );

  return requiredLabels.every((label) => issueLabels.has(label));
}

function toPrdItem(
  issue: Issue,
  existingPasses: Map<number, boolean>,
): PrdItem {
  const labels = (issue.labels ?? [])
    .map((label) => label.name?.trim())
    .filter((label): label is string => Boolean(label))
    .sort();

  return {
    category: "github-issue",
    description: `Issue #${issue.number}: ${issue.title.trim()}`,
    steps: extractSteps(issue),
    passes: existingPasses.get(issue.number) ?? false,
    issueNumber: issue.number,
    url: issue.url,
    labels,
    blockedBy: extractBlockedBy(issue.body),
  };
}

function extractBlockedBy(body: string) {
  const blockedBySection = extractSection(body, ["Blocked by"]);

  if (!blockedBySection) {
    return [];
  }

  const matches = blockedBySection.matchAll(/blocked by\s+#(\d+)/gi);
  const issueNumbers = new Set<number>();

  for (const match of matches) {
    const issueNumber = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(issueNumber)) {
      issueNumbers.add(issueNumber);
    }
  }

  return [...issueNumbers].sort((left, right) => left - right);
}

function extractSteps(issue: Issue) {
  const acceptance = extractSection(issue.body, [
    "Acceptance criteria",
    "Verify",
    "Verification",
    "Steps to verify",
  ]);
  const acceptanceSteps = extractListItems(acceptance);
  if (acceptanceSteps.length > 0) {
    return acceptanceSteps;
  }

  const goal = extractSection(issue.body, [
    "What to build",
    "Goal",
    "Summary",
    "Description",
  ]);
  if (goal) {
    return [normalizeWhitespace(goal)];
  }

  return [normalizeWhitespace(issue.title)];
}

function extractSection(body: string, headings: Array<string>) {
  const normalized = body.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  for (const heading of headings) {
    const targetHeading = `## ${heading}`.toLowerCase();
    const startIndex = lines.findIndex(
      (line) => line.trim().toLowerCase() === targetHeading,
    );

    if (startIndex === -1) {
      continue;
    }

    const sectionLines: Array<string> = [];
    for (const line of lines.slice(startIndex + 1)) {
      if (line.trim().startsWith("## ")) {
        break;
      }
      sectionLines.push(line);
    }

    const section = sectionLines.join("\n").trim();
    if (section) {
      return section;
    }
  }

  return "";
}

function extractListItems(section: string) {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(?:[-*]|\d+\.)\s+(?:\[(?: |x|X)\]\s+)?(.+)$/);
      return match?.[1]?.trim() ?? "";
    })
    .filter(Boolean)
    .map(normalizeWhitespace);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
