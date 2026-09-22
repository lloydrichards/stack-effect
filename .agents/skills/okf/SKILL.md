---
name: okf
description: Keep a repository's Open Knowledge Format (OKF) bundle accurate as code, contracts, decisions, and research change. Use for OKF exploration, creation, maintenance, validation, broken links, or okf-graph.
---

# Manage a repository OKF bundle

Find the bundle root and follow the repository's existing OKF conventions. It is often `.okf/`. Current code, tests, specifications, and cited sources ground the bundle's claims. Keep durable knowledge in OKF; leave task notes, copied test output, and facts recoverable from Git elsewhere.

## Choose the task

- **Explore or answer:** read the root `index.md`, then inspect relevant concepts and graph neighborhoods. Do not edit for a read-only request.
- **Validate or audit:** run the repository's checks, inspect findings, and report them. Fix only when asked.
- **Create:** find the concept that should own the new knowledge. Add a focused concept only when none exists, connect it selectively, and validate.
- **Maintain after code changes:** use the change-driven path below. An implementation edit does not by itself require an OKF edit.

## Find and read concepts

1. Start with the bundle's root `index.md` if present. Follow indexes to the relevant section instead of reading every file.
2. Search filenames, frontmatter, and cited source paths to narrow the set of concepts.
3. Use `okf-graph bundle index <bundle-path>`, `okf-graph concept <bundle-path> <concept-id>`, `okf-graph graph neighbors <bundle-path> <concept-id> --json`, or `okf-graph graph path <bundle-path> <from-id> <to-id> --json` as needed.
4. Check important or possibly stale claims against their current sources. A concept ID is its bundle-relative path without `.md`.

Use the repository's pinned CLI version or check script when it has one. Confirm availability before suggesting a command as a completed check.

## Maintain knowledge after a repository change

1. Inspect the changed code, tests, and documentation. Name the durable claim, contract, decision, or capability that changed.
2. Search the bundle for concepts that cite the affected repository paths, then inspect their immediate graph neighbors:

   ```bash
   rg -nF '<repository-relative-source-path>' <bundle-path>
   okf-graph graph neighbors <bundle-path> <concept-id> --json
   ```

3. If existing claims remain accurate, leave the bundle alone. Formatting, file churn, and behavior-preserving refactors normally need no knowledge or log change.
4. Otherwise update the smallest set of owning concepts. Correct their claims, sources, lifecycle status, and relationships. Check related profiles or contracts when implemented or deferred behavior changes.
5. Update a concept's `generated.at` only when its meaning changes. Preserve other metadata and unknown frontmatter fields. If the bundle has a `log.md` convention, add one concise entry for the material knowledge change; skip it for validation-only runs and link-only repairs unless the repository requires one.
6. Run the repository's OKF check script if present. Otherwise validate the bundle and inspect changed concepts and their neighbors. Report unresolved findings.

If implementation contradicts an accepted decision, report the conflict instead of silently rewriting the decision to match the code.

## Author concepts and links

- Give each concept one coherent purpose. Prefer revising an existing concept over creating a near-duplicate.
- Start concept files with YAML frontmatter. `type` is required. Add a useful `title` and `description`. Follow the bundle's conventions for `status`, `sources`, `generated`, and optional `timestamp`.
- Ground claims in current sources. Resolve relative source paths from the concept file's directory. Do not claim `verified` unless a human or deterministic check performed that verification.
- Use `status: draft` for unsettled research or proposals when the bundle uses lifecycle status. Keep accepted decisions and implemented behavior distinct from drafts and deferred capabilities.
- Use file-relative Markdown links so they work in the CLI and in repository viewers. Link concepts when the relationship helps traversal, and put a short relation phrase in the link title when known: `[Soil moisture check](../care/soil-moisture-check.md "diagnosed by")`.
- Use `index.md` for navigation. Update its links when discovery changes. Only the bundle-root index may have OKF version frontmatter; do not treat indexes as concepts.
- Keep graph neighborhoods focused. Avoid broad reciprocal links added only for symmetry.

## Validate and report

Run `okf-graph validate <bundle-path> --json` or the repository's pinned equivalent. If the bundle has structural quality rules, also run `okf-graph eval <bundle-path> --json` and inspect changed concepts with `concept` and `graph neighbors`. Review warnings and metrics in context; do not add links solely to improve a metric.

Report whether an OKF edit was needed, the concepts changed, the sources checked, exact validation results, and unresolved drafts or conflicts. Do not claim validation passed when it did not run.
