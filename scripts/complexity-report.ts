#!/usr/bin/env bun
/**
 * Complexity report — powered by tsmetrics-core, rewritten with Effect + unstable/cli
 *
 * Usage:
 *   bun run complexity:effect                   # table output, threshold 5
 *   bun run complexity:effect -- --threshold=10
 *   bun run complexity:effect -- -t 10
 *   bun run complexity:effect -- --json
 *   bun run complexity:effect -- --json --threshold=0
 *
 * Env var overrides (all optional):
 *   COMPLEXITY_LEVEL_LOW_MAX=5
 *   COMPLEXITY_LEVEL_NORMAL_MAX=10
 *   COMPLEXITY_LEVEL_HIGH_MAX=20
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import {
  Array as Arr,
  Config,
  Console,
  Data,
  Effect,
  FileSystem,
  Option,
  Order,
  Path as PlatformPath,
  pipe,
  Schema,
  String as Str,
} from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { Ansi, Box } from "effect-boxes";
import {
  type IMetricsConfiguration,
  type IMetricsModel,
  MetricsConfiguration,
  MetricsParser,
} from "tsmetrics-core";
import * as ts from "typescript";

// ---------------------------------------------------------------------------
// tsmetrics config — mirrors .vscode/settings.json codemetrics values
// ---------------------------------------------------------------------------
const metricsConfig: IMetricsConfiguration = {
  ...MetricsConfiguration,
  ComplexityLevelExtreme: 20,
  CodeLensHiddenUnder: 0,
  MetricsForArrowFunctionsToggled: false,
  // Effect/functional idioms
  ReturnStatement: 0,
  CaseClause: 0,
  DefaultClause: 0,
  // JSX structural nodes — markup is not cognitive complexity
  JsxElement: 0,
  JsxSelfClosingElement: 0,
  // Syntax-mandated and data-literal nodes
  BreakStatement: 0,
  ObjectLiteralExpression: 0,
  ThrowStatement: 0,
  // Function wrapper nodes — in a functional/Effect codebase the wrapper
  // itself carries no complexity; the body's ifs/loops/branches do
  FunctionDeclaration: 0,
  FunctionExpression: 0,
  MethodDeclaration: 0,
};

// ---------------------------------------------------------------------------
// Config — level thresholds overridable via env vars
// ---------------------------------------------------------------------------
const LevelConfig = Config.all({
  lowMax: Config.int("COMPLEXITY_LEVEL_LOW_MAX").pipe(Config.withDefault(5)),
  normalMax: Config.int("COMPLEXITY_LEVEL_NORMAL_MAX").pipe(
    Config.withDefault(10),
  ),
  highMax: Config.int("COMPLEXITY_LEVEL_HIGH_MAX").pipe(Config.withDefault(20)),
});

// ---------------------------------------------------------------------------
// Schema — types for Level, Reason, FunctionEntry, and JSON report output
// ---------------------------------------------------------------------------

class ComplexityFailure extends Data.TaggedError("ComplexityFailure")<{
  message: string;
  cause?: unknown;
}> {}

const Level = Schema.Literals(["low", "normal", "high", "extreme"]);

const Reason = Schema.Struct({
  description: Schema.String,
  complexity: Schema.Number,
  line: Schema.Number,
  col: Schema.Number,
  text: Schema.String,
});

const FunctionEntry = Schema.Struct({
  file: Schema.String,
  name: Schema.String,
  line: Schema.Number,
  complexity: Schema.Number,
  level: Level,
  reasons: Schema.NullOr(Schema.Array(Reason)),
});

const LevelCounts = Schema.Struct({
  low: Schema.Number,
  normal: Schema.Number,
  high: Schema.Number,
  extreme: Schema.Number,
});

const JsonReport = Schema.Struct({
  threshold: Schema.Number,
  totalFunctions: Schema.Number,
  levelCounts: LevelCounts,
  functions: Schema.Array(FunctionEntry),
});

// ---------------------------------------------------------------------------
// Helpers — pure functions extracted for testability and low complexity
// ---------------------------------------------------------------------------

const getLevel = (
  score: number,
  lowMax: number,
  normalMax: number,
  highMax: number,
): typeof Level.Type => {
  if (score <= lowMax) return "low";
  if (score <= normalMax) return "normal";
  if (score <= highMax) return "high";
  return "extreme";
};

const firstLine = (text: string): string =>
  pipe(
    text,
    Str.split("\n"),
    Arr.head,
    Option.getOrElse(() => ""),
    Str.trim,
    Str.takeLeft(80),
  );

const collectReasons = (
  node: IMetricsModel,
  out: (typeof Reason.Type)[] = [],
): (typeof Reason.Type)[] => {
  if (node.complexity > 0) {
    out.push({
      description: node.description,
      complexity: node.complexity,
      line: node.line,
      col: node.column,
      text: firstLine(node.text),
    });
  }
  for (const child of node.children) collectReasons(child, out);
  return out;
};

const walkMetrics = (
  node: IMetricsModel,
  rel: string,
  levelThresholds: { lowMax: number; normalMax: number; highMax: number },
  out: (typeof FunctionEntry.Type)[] = [],
): (typeof FunctionEntry.Type)[] => {
  if (node.visible) {
    const score = node.getCollectedComplexity();
    const level = getLevel(
      score,
      levelThresholds.lowMax,
      levelThresholds.normalMax,
      levelThresholds.highMax,
    );
    out.push({
      file: rel,
      name: firstLine(node.text),
      line: node.line,
      complexity: score,
      level,
      reasons:
        level === "high" || level === "extreme" ? collectReasons(node) : null,
    });
  }
  for (const child of node.children)
    walkMetrics(child, rel, levelThresholds, out);
  return out;
};

// ---------------------------------------------------------------------------
// Effect: parse a single file for metrics (silently skip on error)
// ---------------------------------------------------------------------------
const parseFile = Effect.fn("parseFile")(function* (file: string) {
  const levelThresholds = yield* LevelConfig;
  const root = yield* Effect.sync(() => process.cwd());
  const rel = file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file;

  const { metrics } = yield* Effect.try({
    try: () =>
      MetricsParser.getMetrics(file, metricsConfig, ts.ScriptTarget.ESNext),
    catch: (err) =>
      new ComplexityFailure({
        message: `Failed to parse ${rel}`,
        cause: err,
      }),
  });

  return walkMetrics(metrics, rel, levelThresholds);
});

// ---------------------------------------------------------------------------
// Box helpers
// ---------------------------------------------------------------------------
const levelAnsi: Record<typeof Level.Type, Ansi.AnsiAnnotation> = {
  low: Ansi.green,
  normal: Ansi.blue,
  high: Ansi.yellow,
  extreme: Ansi.red,
};

function levelBox(
  level: typeof Level.Type,
  text: string,
): Box.Box<Ansi.AnsiStyle> {
  return Box.text(text).pipe(Box.annotate(levelAnsi[level]));
}

function pad(s: string, n: number): string {
  return pipe(s.length >= n ? s.slice(0, n) : s, Str.padEnd(n));
}

// ---------------------------------------------------------------------------
// Effect: collect .ts/.tsx files from root using FileSystem
// ---------------------------------------------------------------------------
const IGNORED_DIRS = [
  "node_modules",
  "dist",
  ".turbo",
  ".cache",
  "coverage",
  ".reference",
];

const isTestOrDeclarationFile = (entry: string): boolean =>
  entry.endsWith(".test.ts") ||
  entry.endsWith(".test.tsx") ||
  entry.endsWith(".spec.ts") ||
  entry.endsWith(".d.ts") ||
  entry.endsWith("scratchpad.ts");

const isInIgnoredDir = (entry: string): boolean =>
  entry.split("/").some((p) => IGNORED_DIRS.includes(p));

const collectTsFiles = Effect.fn(function* (filterDir: string | undefined) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* PlatformPath.Path;
  const root = yield* Effect.sync(() => process.cwd());
  const scanRoot = filterDir
    ? path.isAbsolute(filterDir)
      ? filterDir
      : path.join(root, filterDir)
    : root;
  const all = yield* fs.readDirectory(scanRoot, { recursive: true });

  return pipe(
    all,
    Arr.filter((entry) => /\.(ts|tsx)$/.test(entry)),
    Arr.filter((entry) => !isTestOrDeclarationFile(entry)),
    Arr.filter((entry) => !isInIgnoredDir(entry)),
    Arr.map((entry) => path.join(scanRoot, entry)),
  );
});

// ---------------------------------------------------------------------------
// Box helper
// ---------------------------------------------------------------------------

const Table = (
  columns: ReadonlyArray<{
    readonly header: string;
    readonly width: number;
    readonly align?: typeof Box.left;
    readonly headerAlign?: typeof Box.left;
  }>,
  rows: Box.Box<Ansi.AnsiStyle>[][],
): Box.Box<Ansi.AnsiStyle> => {
  const sep = Box.text(" │ ");

  const headerRow = Box.punctuateH(
    columns.map(({ header, width, headerAlign }) =>
      Box.text(header).pipe(
        Box.alignHoriz(headerAlign ?? Box.center1, width),
        Box.annotate(Ansi.bold),
      ),
    ),
    Box.top,
    sep,
  );

  const divider = Box.text("─".repeat(headerRow.cols));

  const dataRows = rows.map((row) =>
    Box.punctuateH(
      row.map((cell, i) => {
        const col = columns[i];
        return cell.pipe(
          Box.alignHoriz(col?.align ?? Box.left, col?.width ?? 12),
        );
      }),
      Box.top,
      sep,
    ),
  );

  return Box.vcat([headerRow, divider, ...dataRows], Box.left);
};

const Border = <A>(self: Box.Box<A>): Box.Box<A> => {
  const middleBorder = pipe(
    Arr.makeBy(self.rows, () => Box.char("│")),
    Box.vcat(Box.left),
  );
  const topBorder = pipe(
    [Box.char("┌"), Box.text("─".repeat(self.cols)), Box.char("┐")],
    Box.hcat(Box.top),
  );
  const bottomBorder = pipe(
    [Box.char("└"), Box.text("─".repeat(self.cols)), Box.char("┘")],
    Box.hcat(Box.top),
  );
  const middleSection = pipe(
    [middleBorder, self, middleBorder],
    Box.hcat(Box.top),
  );
  return pipe([topBorder, middleSection, bottomBorder], Box.vcat(Box.left));
};

const Padding =
  <A>(width: number) =>
  (self: Box.Box<A>) =>
    pipe(
      self,
      Box.moveUp(width),
      Box.moveDown(width),
      Box.moveLeft(width),
      Box.moveRight(width),
    );

// ---------------------------------------------------------------------------
// Report builders
// ---------------------------------------------------------------------------

const LEVELS: readonly (typeof Level.Type)[] = [
  "low",
  "normal",
  "high",
  "extreme",
];

function buildHeader(
  threshold: number,
  totalFunctions: number,
  flaggedCount: number,
  width?: number,
): Box.Box<Ansi.AnsiStyle> {
  const title = Box.text("COMPLEXITY REPORT").pipe(
    Box.annotate(Ansi.combine(Ansi.bold, Ansi.white)),
  );
  const info = Box.text(
    `threshold ≥ ${threshold}  ·  ${totalFunctions} functions  ·  ${flaggedCount} flagged`,
  );
  const inner = Box.vcat([title, info], Box.left);
  // Border adds 2 cols, Padding(1) adds 2 cols — size content so chrome matches target
  const content = width
    ? inner.pipe(Box.alignHoriz(Box.left, width - 4))
    : inner;
  return pipe(content, Padding(1), Border);
}

const SCORE_COLUMNS = [
  { header: "Score", width: 7, align: Box.right },
  { header: "Level", width: 9 },
  { header: "Function", width: 40, headerAlign: Box.left },
  { header: "File:Line", width: 35, headerAlign: Box.left },
] as const;

function buildScoreTable(
  filtered: readonly (typeof FunctionEntry.Type)[],
): Box.Box<Ansi.AnsiStyle> {
  if (filtered.length === 0) {
    return Box.text("  No functions above threshold.").pipe(
      Box.annotate(Ansi.dim),
    );
  }

  const rows: Box.Box<Ansi.AnsiStyle>[][] = [];

  for (const entry of filtered) {
    const loc = `${entry.file}:${entry.line}`;
    rows.push([
      Box.text(String(entry.complexity)),
      levelBox(entry.level, entry.level),
      Box.text(pad(entry.name, SCORE_COLUMNS[2].width)),
      Box.text(pad(loc, SCORE_COLUMNS[3].width)),
    ]);

    // Expand reasons for high/extreme entries
    if (
      (entry.level === "high" || entry.level === "extreme") &&
      entry.reasons
    ) {
      for (let i = 0; i < entry.reasons.length; i++) {
        const reason = entry.reasons[i];
        const isLast = i === entry.reasons.length - 1;
        const prefix = isLast ? "└" : "├";
        const reasonText = `${prefix} ${reason.description} (+${reason.complexity})  :${reason.line}`;
        rows.push([
          Box.nullBox,
          Box.nullBox,
          Box.text(pad(reasonText, SCORE_COLUMNS[2].width)).pipe(
            Box.annotate(Ansi.dim),
          ),
          Box.nullBox,
        ]);
      }
    }
  }

  return Table(SCORE_COLUMNS, rows).pipe(Border);
}

function buildSummary(
  allEntries: readonly (typeof FunctionEntry.Type)[],
  counts: Record<typeof Level.Type, number>,
  width?: number,
): Box.Box<Ansi.AnsiStyle> {
  const total = allEntries.length || 1;

  // Proportional distribution bar
  const barWidth = width ? width - 19 : 50;
  const barSegments = LEVELS.map((level) => {
    const count = counts[level];
    const width = Math.max(
      Math.round((count / total) * barWidth),
      count > 0 ? 1 : 0,
    );
    return width > 0
      ? Box.text("█".repeat(width)).pipe(
          Box.moveRight(1),
          Box.annotate(levelAnsi[level]),
        )
      : Box.nullBox;
  });
  const bar = Box.hcat(barSegments, Box.top);

  // Percentage legend
  const pctLabel = Box.hsep(
    LEVELS.map((level) => {
      const pct = Math.round((counts[level] / total) * 100);
      return levelBox(level, `${level} ${pct}%`);
    }),
    2,
    Box.top,
  );

  // Descriptive stats
  const complexities = [...allEntries.map((e) => e.complexity)].sort(
    (a, b) => a - b,
  );
  const mean = complexities.reduce((a, b) => a + b, 0) / total;
  const median = complexities[Math.floor(complexities.length / 2)] ?? 0;
  const p90 = complexities[Math.floor(complexities.length * 0.9)] ?? 0;
  const max = complexities[complexities.length - 1] ?? 0;

  const statsLine = Box.text(
    `${allEntries.length} total · mean ${mean.toFixed(1)} · median ${median} · p90 ${p90} · max ${max}`,
  );

  // Health verdict based on high+extreme ratio
  const hotCount = counts.high + counts.extreme;
  const hotRatio = hotCount / total;
  const [verdictText, verdictAnsi] =
    hotRatio === 0
      ? (["HEALTHY", Ansi.green] as const)
      : hotRatio <= 0.05
        ? (["MODERATE", Ansi.blue] as const)
        : hotRatio <= 0.15
          ? (["CONCERNING", Ansi.yellow] as const)
          : (["CRITICAL", Ansi.red] as const);
  const verdict = Box.text(verdictText).pipe(
    Box.annotate(Ansi.combine(Ansi.bold, verdictAnsi)),
  );
  const verdictLine = Box.hcat(
    [Box.text("Health: "), verdict, Box.text(`  (${hotCount} high/extreme)`)],
    Box.top,
  );

  // Layout
  const label = Box.text("Distribution: ");
  const barLine = Box.hcat([label, bar], Box.top);

  return Box.vsep(
    [
      Box.vcat([barLine, pctLabel.pipe(Box.moveRight(label.cols+1))], Box.left),
      statsLine,
      verdictLine,
    ],
    1,
    Box.left,
  );
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------
const jsonFlag = Flag.boolean("json").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Output results as JSON"),
);

const filterFlag = Flag.directory("filter").pipe(
  Flag.optional,
  Flag.withDescription("Only include functions in files under this directory"),
  Flag.withAlias("f"),
);

const thresholdFlag = Flag.integer("threshold").pipe(
  Flag.withDefault(5),
  Flag.withAlias("t"),
  Flag.withDescription("Minimum complexity score to include in output"),
);

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------
const complexityCommand = Command.make(
  "complexity",
  { json: jsonFlag, threshold: thresholdFlag, filter: filterFlag },
  ({ json, threshold, filter }) =>
    Effect.gen(function* () {
      const files = yield* collectTsFiles(Option.getOrUndefined(filter));

      const allEntries = yield* Effect.all(files.map(parseFile)).pipe(
        Effect.map(Arr.flatten),
      );

      const filtered = pipe(
        allEntries,
        Arr.filter((e) => e.complexity >= threshold),
        Arr.sortWith((e) => e.complexity, Order.flip(Order.Number)),
      );

      const counts: Record<typeof Level.Type, number> = {
        low: 0,
        normal: 0,
        high: 0,
        extreme: 0,
      };
      for (const e of allEntries) counts[e.level]++;

      if (json) {
        const jsonString = Schema.encodeSync(Schema.fromJsonString(JsonReport))(
          {
            threshold,
            totalFunctions: allEntries.length,
            levelCounts: counts,
            functions: filtered,
          },
        );
        yield* Console.log(jsonString);
        return;
      }

      const tableBox = buildScoreTable(filtered);
      const targetWidth = tableBox.cols;
      const headerBox = buildHeader(
        threshold,
        allEntries.length,
        filtered.length,
        targetWidth,
      );
      const summaryBox = buildSummary(allEntries, counts, targetWidth);

      yield* Console.log(
        Box.renderPrettySync(
          Box.vsep([headerBox, tableBox, summaryBox], 1, Box.left),
        ),
      );
    }),
);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const program = Command.run(complexityCommand, { version: "1.0.0" }).pipe(
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(program);
