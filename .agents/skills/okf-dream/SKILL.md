---
name: okf-dream
description: Reorganize an Open Knowledge Format (OKF) bundle after development. Use for periodic cleanup of handovers, overlapping concepts, and scattered observations. Supports review-only and unattended cleanup runs.
---

# Consolidate accumulated OKF knowledge

Prepare a reviewable diff within the requested scope. The caller controls delivery. For a review-only request, propose edits and leave the files untouched.

## Find the durable answers

Start at the index. Gather the affected concepts, their sources, and references to IDs you may retire. Organize the material around questions a future reader needs answered. Drop session narration. Preserve unique conditions, rationale, attribution, and uncertainty, including unreproduced observations worth investigating.

Synthesize only what the evidence supports. Repeated recovery after an intervention establishes an observation across those incidents. Cause, safety, and operating policy each need their own evidence. If implementation and tests contradict an accepted decision, document current behavior, preserve the decision, and flag the difference. Change decision history only when a later accepted decision supersedes it.

## Reorganize and verify

Merge, split, move, create, rename, or delete concepts as needed. Delete a page outright when nothing durable remains. Repair the index, incoming links, and heading references. For a known external consumer, keep a pointer to the replacement concept or flag the migration it needs. An index provides navigation and cannot serve as the target concept for that pointer.

Use relative Markdown links between bundle concepts. Cite evidence outside the bundle in frontmatter `sources[].resource`, relative to the concept file. A relative Markdown link to that same evidence creates an unresolved graph edge. Rebase moved references and preserve source IDs, footnotes, custom metadata, and the scope of verification claims.

Review the changed answers and links. Run the repository's OKF check on the resulting bundle, or use `npx --yes okf-graph@latest validate "<bundle-path>" --json` with Bun available. Inspect warnings and fix regressions. If the evidence already has a concise, accurate home, leave pages, logs, and timestamps alone.

## Hand off the diff

Group structural changes into one summary. Account for retired IDs and where their useful content went, including IDs dropped without replacement. Report validation findings. Ask individual questions only for judgments that would change what readers believe or do. Flag an observed conflict with its evidence and the choice it requires. Keep an evidence gap as uncertainty unless someone actually needs a decision about it. Complete independent cleanup while questions remain open.
