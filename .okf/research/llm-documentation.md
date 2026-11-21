---
type: Research Report
title: LLM documentation discovery and use
description: Public Markdown publishing and read-only planning guidance for coding agents.
status: stable
sources:
  - id: docs-build
    resource: ../../apps/docs/vite.config.ts
  - id: agent-guide
    resource: ../../apps/docs/app/content/use-with-coding-agents.mdx
  - id: rendering
    resource: ../../apps/docs/react-router.config.ts
  - id: hosting
    resource: ../../apps/docs/vercel.json
  - id: manifest
    resource: ../../apps/docs/app/lib/docs-manifest.ts
  - id: converter
    resource: ../../apps/docs/scripts/docs-markdown.ts
  - id: publisher
    resource: ../../apps/docs/scripts/docs-markdown-plugin.ts
  - id: bundled-skill
    resource: ../../apps/cli/src/skills/stack-effect/SKILL.md
generated: { by: codex, at: "2026-11-21T18:01:47+00:00" }
---

# LLM documentation discovery and use

The docs manifest owns the public content-backed pages and their Markdown paths. The converter builds per-page Markdown and a curated `/llms.txt` from the site's MDX sources, including generated CLI reference pages. It preserves fenced code and gives known interactive components explicit text equivalents. Unsupported meaningful MDX fails conversion so the published text cannot silently omit instructions. Recipe Builder remains interactive and is linked from the Markdown.

Register new content pages in the manifest. When introducing an MDX component, add its text representation to the converter. The Vite plugin serves the text in development and emits static assets for production. Vercel routes missing text paths to 404 before the SPA fallback. Hosting behavior should be checked on the deployment when those rules change.

## Agent workflow

The short bootstrap points to one canonical guide. With a goal it starts read-only discovery and planning. Without a goal it asks for one. The CLI also ships the agent workflow as an installable skill.

Discovery and planning use the intended project's catalog sources. A pinned CLI version still fetches or revalidates definitions for each operation. Compare source digests across structured Plan outputs, repeat discovery and planning on a change, and disclose cached sources. The schema output does not carry digests, so it cannot establish that discovery and planning used the same bytes. See [catalog source selection](../architecture/catalog-source-selection.md "defines source and trust rules").

The workflow respects authorization already given and asks before work outside it. Plan review reports conflicts and proposed Finalize commands. The CLI has no public endpoint for applying Plan JSON with agent-supplied ApplyDecision values.

## Rationale and limits

The October 2026 review of [AI Hero](https://www.aihero.dev/llms.txt) and [Alchemy](https://alchemy.run/) favored a visible directory of readable pages and a short handoff prompt. Alchemy's separate prompt and guide illustrated how duplicated setup instructions can drift. The [llms.txt proposal](https://llmstxt.org/) provides a retrieval convention. Automatic discovery and search ranking were outside the evidence.

The app still uses client rendering. Prerendering, a full-text bundle, and a search API were deferred. The implementation verified local conversion, asset output, retrieval, and copy behavior. That evidence does not establish current production responses.
