import {
  CompositionOperation,
  type PlanConflict,
  type PlanOutcome,
} from "@repo/domain/Plan";
import { Array, Effect, Match, pipe } from "effect";

// =============================================================================
// Types
// =============================================================================

/**
 * A file outcome fully resolved for LLM consumption.
 *
 * - `create`: the file does not exist; write `contents` verbatim.
 * - `modify`: the file exists; apply `instructions` to the current contents.
 *
 * For brownfield repos, `instructions` describe atomic edits the LLM should
 * make to an existing file rather than overwriting it entirely.
 */
export interface LlmFileOutcome {
  readonly path: string;
  readonly classification: string;
  readonly contents: string | undefined;
  readonly instructions: ReadonlyArray<string>;
}

export interface LlmPlanSummary {
  readonly total: number;
  readonly create: number;
  readonly modify: number;
  readonly unchanged: number;
  readonly conflict: number;
}

export interface LlmPlanOutput {
  readonly summary: LlmPlanSummary;
  readonly tree: string;
  readonly files: ReadonlyArray<LlmFileOutcome>;
  readonly conflicts: ReadonlyArray<{
    readonly path: string;
    readonly kind: string;
    readonly description: string;
  }>;
  readonly finalize: ReadonlyArray<{
    readonly label: string;
    readonly command: string;
  }>;
}

// =============================================================================
// Operation → Instruction Rendering
// =============================================================================

const renderOperation = (
  path: string,
  op: typeof CompositionOperation.Type,
): string =>
  Match.value(op).pipe(
    Match.tag("json-pkg-exports", (o) => {
      const entries = o.entries
        .map((e) => `  "${e.name}": "${e.value}"`)
        .join("\n");
      return `In \`${path}\`, add these entries to the "exports" field:\n${entries}`;
    }),
    Match.tag("json-pkg-deps", (o) => {
      const entries = o.entries
        .map((e) => `  "${e.name}": "${e.value}"`)
        .join("\n");
      return `In \`${path}\`, add these packages to "${o.section}":\n${entries}`;
    }),
    Match.tag("json-pkg-scripts", (o) => {
      const entries = o.entries
        .map((e) => `  "${e.name}": "${e.value}"`)
        .join("\n");
      return `In \`${path}\`, add these scripts:\n${entries}`;
    }),
    Match.tag("ts-add-import", (o) => {
      const specifiers = o.namedImports
        ? `{ ${o.namedImports.join(", ")} }`
        : (o.defaultImport ?? "*");
      const typePrefix = o.typeOnly ? "type " : "";
      return `In \`${path}\`, add import: \`import ${typePrefix}${specifiers} from "${o.moduleSpecifier}"\``;
    }),
    Match.tag("ts-add-reexport", (o) => {
      const specifiers = o.namedExports
        ? `{ ${o.namedExports.join(", ")} }`
        : "*";
      const typePrefix = o.typeOnly ? "type " : "";
      return `In \`${path}\`, add re-export: \`export ${typePrefix}${specifiers} from "${o.moduleSpecifier}"\``;
    }),
    Match.tag("ts-append-call-arg", (o) => {
      return `In \`${path}\`, find \`const ${o.targetVariable} = ${o.functionName}(...)\` and append \`${o.argument}\` as an additional argument`;
    }),
    Match.tag("ts-jsx-slot", (o) => {
      return `In \`${path}\`, inject content at slot \`@slot:${o.slotId}\``;
    }),
    Match.exhaustive,
  );

// =============================================================================
// Conflict Rendering
// =============================================================================

const renderConflict = (
  conflict: typeof PlanConflict.Type,
): { path: string; kind: string; description: string } =>
  Match.value(conflict).pipe(
    Match.tag("exports", (c) => ({
      path: c.path,
      kind: "exports",
      description: `Export entry "${c.name}" already exists in ${c.path}`,
    })),
    Match.tag("dependencies", (c) => ({
      path: c.path,
      kind: "dependencies",
      description: `Package "${c.name}" already exists in ${c.section} of ${c.path}`,
    })),
    Match.tag("scripts", (c) => ({
      path: c.path,
      kind: "scripts",
      description: `Script "${c.name}" already exists in ${c.path}`,
    })),
    Match.tag("barrelExport", (c) => ({
      path: c.path,
      kind: "barrel-export",
      description: `Re-export of "${c.exportPath}" already exists in ${c.path}`,
    })),
    Match.tag("tsconfig", (c) => ({
      path: c.path,
      kind: "tsconfig",
      description: `TypeScript config at ${c.path} already exists and may need manual merging`,
    })),
    Match.tag("completeFile", (c) => ({
      path: c.path,
      kind: "file-exists",
      description: `File ${c.path} already exists; review and merge manually`,
    })),
    Match.tag("compositionTargetNotFound", (c) => ({
      path: c.path,
      kind: "target-not-found",
      description: `Cannot find \`const ${c.targetVariable} = ${c.functionName}(...)\` in ${c.path}; add the argument manually`,
    })),
    Match.exhaustive,
  );

// =============================================================================
// Plan Renderer
// =============================================================================

/**
 * Render a Plan into LLM-consumable output.
 *
 * For `complete` outcomes: pass through contents directly.
 * For `composed` outcomes: render operations as edit instructions.
 *
 * When classification is "create", the LLM should write the seed + apply
 * instructions. When "modify" or "conflict", the LLM should read the
 * existing file and apply instructions to it.
 */
export const renderPlanForLlm = (plan: {
  outcomes: ReadonlyArray<typeof PlanOutcome.Type>;
  conflicts: ReadonlyArray<typeof PlanConflict.Type>;
  finalize?: ReadonlyArray<{ label: string; command: string }>;
  summary: LlmPlanSummary;
  tree: string;
}): LlmPlanOutput => {
  const files: Array<LlmFileOutcome> = pipe(
    plan.outcomes,
    Array.map((outcome) =>
      Match.value(outcome).pipe(
        Match.tag("complete", (o) => ({
          path: o.path,
          classification: o.classification,
          contents: o.contents,
          instructions: [] as ReadonlyArray<string>,
        })),
        Match.tag("composed", (o) => ({
          path: o.path,
          classification: o.classification,
          contents: o.seedContents,
          instructions: o.operations.map((op) => renderOperation(o.path, op)),
        })),
        Match.exhaustive,
      ),
    ),
  );

  const conflicts = pipe(plan.conflicts, Array.map(renderConflict));

  return {
    summary: plan.summary,
    tree: plan.tree,
    files,
    conflicts,
    finalize: plan.finalize ?? [],
  };
};
