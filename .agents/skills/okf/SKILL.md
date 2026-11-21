---
name: okf
description: Write or update Open Knowledge Format (OKF) concepts when a repository decision, contract, or workflow changes. Use to decide what belongs in the bundle, find the existing concept that owns it, and ground the change in sources.
---

# Write durable OKF concepts

Read the primary evidence and likely owners together. Use the index to find candidates. Keep accepted rules, scope, exceptions, and rationale. Omit transient observations. If the answer is unchanged, leave the bundle and log alone. Report conflicts with implementation. Only a superseding decision changes policy.

Put the complete rule where readers look for the answer. Give other affected concepts a Markdown link and any local action. Create a stable concept only when the answer needs its own home.

In v0.2, cite evidence in `sources` with a concept-relative `resource`. Reuse citations and identify the supporting decision or section. Preserve custom metadata, source IDs, and footnotes. New concepts need YAML frontmatter with a nonempty `type`. Follow local logging conventions. Update `generated.at` on material edits only if the bundle already tracks it. Record verification only after checking the source.

For evidence files outside the bundle, keep the path only in `sources` and cite the decision or section in prose.

Run the repository's OKF check or, with Bun available, `npx --yes okf-graph@latest validate "<bundle-path>" --json`. Report placement, evidence, findings, and open questions.
