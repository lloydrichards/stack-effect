---
type: Research Report
title: LLM documentation discovery and use
description: Agent documentation precedents, current documentation gaps, and proposed publishing work for Stack Effect.
status: draft
sources:
  - id: docs-build
    resource: ../../apps/docs/vite.config.ts
  - id: agent-guide
    resource: ../../apps/docs/app/content/use-with-coding-agents.mdx
  - id: rendering
    resource: ../../apps/docs/react-router.config.ts
  - id: hosting
    resource: ../../apps/docs/vercel.json
generated: { by: codex, at: "2026-10-01T12:00:00+02:00" }
---

# LLM documentation discovery and use

Stack Effect already has an agent workflow. The first investment should make that workflow and the rest of the documentation discoverable as clean text. The recommendations below are proposals, not implemented changes. External observations date to October 1, 2026.

## Current implementation

The [coding-agent guide](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/app/content/use-with-coding-agents.mdx) covers CLI version selection, structured discovery, Selection construction, read-only Plan formats, conflicts, approval, manual edits, Finalize, and verification. It explicitly explains that no public machine-readable command applies a Plan with agent-selected ApplyDecision values. Preserve this limitation in every short bootstrap prompt.

The [Vite configuration](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/vite.config.ts) already publishes `/use-with-coding-agents.md` in development and emits it as a build asset. The [guide route](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/app/routes/use-with-coding-agents.tsx) provides Copy Markdown and an alternate Markdown link. This is a useful existing implementation to extend.

The [route configuration](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/app/routes.ts) and [navigation](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/app/nav.config.ts) list documentation pages, but there is no shared publishing manifest for their Markdown counterparts. The [footer](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/app/components/doc-footer.tsx) has no agent documentation links. No `llms.txt`, `llms-full.txt`, robots file, or sitemap was found in `apps/docs/public` or the inspected build configuration.

The app uses React Router with Vite, not VitePress. [Rendering configuration](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/react-router.config.ts) disables both runtime SSR and prerendering. This makes client rendering a dependency for retrieving page content from the deployed HTML. Production response bodies were not verified: requests to the configured `stack-effect.lloydrichards.dev` host failed through both the shell network and the web research tool.

The [root metadata](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/app/root.tsx) uses a generic title and description, with `og:url` pointing to GitHub. Add route-specific titles, descriptions, and canonical documentation URLs alongside publishing work.

## Precedents

[AI Hero's footer](https://www.aihero.dev/) links `sitemap.md`, `llms.txt`, `skills.md`, and RSS. Its directly retrieved [llms.txt](https://www.aihero.dev/llms.txt) advertises Markdown page counterparts, content negotiation, JSON search and resource APIs, OpenAPI, and an API catalog. The advertised APIs and Markdown contents were not independently verified. The transferable idea is a visible directory and clean page retrieval. Its authenticated CMS operations do not justify adding write APIs to Stack Effect.

[Alchemy](https://alchemy.run/), the Effect infrastructure project, currently has a "Build it with your agent" entry point and a copyable bootstrap prompt. A literal human-or-agent switch was not observed in the extracted page. The prompt directs an initial task, targeted retrieval through llms.txt and llms-full.txt, and a pause for the user's goal. Those files could not be directly fetched in this environment, so their described roles remain advertised behavior. The [official README](https://github.com/alchemy-run/alchemy) also carries agent onboarding. Repeat Stack Effect's agent entry link in its README and npm documentation.

Alchemy also demonstrates the maintenance risk of detailed duplicated prompts. Its landing prompt says deployment can prompt for credentials, while the [getting-started guide](https://alchemy.run/getting-started/) says authentication happens through the profile command and unconfigured deployment fails. Stack Effect should keep detailed commands in canonical docs and validate its short prompt against them. Neither example's build implementation was inspected.

The [llms.txt proposal](https://llmstxt.org/) describes a concise Markdown index with descriptions and links to suitable content. Treat it as an agent retrieval convention. It does not establish that all agents fetch it automatically or that adding it improves search ranking. Ordinary crawl discovery and explicit instructions still matter.

The [VitePress LLM plugin](https://github.com/okineadev/vitepress-plugin-llms) illustrates per-page Markdown, an index, and a full bundle. Its VitePress integration is not a direct fit for this React Router application. [Vite plugin hooks](https://vite.dev/guide/api-plugin.html) support development middleware and build integrations; production still needs emitted assets and correct hosting behavior.

## Recommended work

| Priority | Work | Reason |
| --- | --- | --- |
| First | Publish clean Markdown for every documentation route and a curated `/llms.txt` | Agents can find and retrieve authoritative content without executing the app. |
| First | Add a landing-page agent link and persistent footer links | Users can provide an agent with the correct starting URL. |
| First | Expand the guide for project catalog sources and independently changing catalogs | Discovery must use the same configured sources as planning. |
| Next | Prerender documentation routes, add sitemap and canonical metadata | HTML retrieval and ordinary search discovery become useful alongside Markdown. |
| Next | Add compact automation reference and task recipes | Agents can look up output shapes, failures, and recovery without rereading a long tutorial. |
| Later | Add a full documentation bundle and optional task-specific bundles | Users can paste or download a larger context when selective retrieval is unavailable. |
| Conditional | Add a docs search API or MCP server | Build only when observed retrieval failures justify another service. |

### Publish from one manifest

Create a documentation manifest with route, source, title, summary, and inclusion rules. Reuse it for Markdown output, llms.txt, sitemap, page actions, and route metadata. Integrate generation after the existing CLI reference generation in [docs build scripts](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/package.json). Keep generated CLI reference content authoritative.

The existing raw-file export works for the agent guide, which is plain Markdown. Other MDX files import components and contain JSX, including the homepage's BlueprintWorkbench and getting-started disclosures. Do not rename all MDX files to `.md` and serve them unchanged. Transform MDX structurally, preserve prose and fenced examples, unwrap disclosure content, and give interactive components explicit text alternatives. Rewrite internal links to absolute documentation or Markdown URLs so copied text works outside the website. A home-page text summary should explain the Recipe Builder's role.

Start llms.txt with the project purpose and the preferred agent guide. Link CLI schema and plan references, catalog source rules, non-interactive init and add, and the conceptual lifecycle. Include brief descriptions and links to the live registry and configuration schema, but explain their distinct jobs. The config schema is not the Plan input schema; the CLI's `schema` command provides the latter.

Provide a concise bootstrap prompt that directs the agent to the guide, asks it to inspect the repository and configured catalogs, discover current IDs, generate a Plan, and follow the documented approval policy. Keep the detailed workflow in one place. Use normal links rather than requiring a human-or-agent modal or guessing from user-agent headers.

### Correct the catalog session guidance

The guide currently runs `schema` without `--root`, while Plan commands use the repository root. The [schema command](https://github.com/lloydrichards/stack-effect/blob/main/apps/cli/src/commands/schema.ts) accepts both root and catalog flags. Document discovery against the intended project's saved sources, with explicit source selection for a greenfield project. Confirm examples against the CLI before publishing a revised tutorial.

The guide's statement that targets and modules are available "in this version" is incomplete. [Catalog documentation](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/app/content/catalog-registry.mdx) says each new catalog-dependent command revalidates current definitions, while one command retains its loaded CatalogService. Pinning the CLI does not freeze the remote catalog between separate schema and Plan invocations. Explain cache notices, permanent failures, and the need to inspect fresh Plan output and re-plan when definitions or repository state change. Do not promise a cross-command snapshot or catalog lockfile that does not exist. The [catalog source selection decision](../architecture/catalog-source-selection.md "constrains session guidance") owns the underlying contract.

### Add lookup material and recipes

Separate the tutorial from a compact automation reference covering input JSON, the `llm` and `raw` output structures, stdout versus stderr, conflict behavior, `--yes`, exit behavior, and the absence of a Plan application endpoint. Generate schemas or examples from owning contracts where possible. Explain which guidance applies to scaffolding and which requires upstream Effect documentation.

Add recipes for a new repository, adding an HTTP API to an existing repository, selecting a custom catalog, and recovering from a conflict or failed catalog load. Each should specify prerequisites, discovery commands, expected output, and verification. Discover IDs rather than maintaining a second static module list. Publishing skill files can be a later convenience, generated from the same workflow rather than an independently maintained instruction set.

### Make hosting behavior explicit

Use emitted static assets for production Markdown and indexes. Development middleware alone does not deploy an endpoint. Update [Vercel routing](https://github.com/lloydrichards/stack-effect/blob/main/apps/docs/vercel.json) so unknown machine-readable paths return actual 404 responses before the SPA fallback. Configure appropriate text content types and revalidation caching. Check GET and HEAD, response body, and missing-path behavior on a deployment.

Prerender documentation routes while retaining the Recipe Builder as an interactive application. [React Router prerendering](https://reactrouter.com/how-to/pre-rendering) supports selected paths with `ssr: false`. Audit browser-dependent components and worker startup before enabling it. Do not assume changing one configuration flag is sufficient.

## Acceptance evidence

The first implementation should prove that every indexed Markdown URL returns readable text, internal links resolve, code examples survive MDX conversion, and unknown document assets return 404 rather than HTML. Compare development and build output. Check that source edits regenerate exports and that no private OKF research enters the public bundle by accident.

Run a bounded agent retrieval exercise starting with only the homepage or llms.txt URL. Ask the agent to find a module, produce a read-only Plan for an existing project with saved catalogs, and explain a conflict. Record missed links, invented commands, and unsupported assumptions. Use these observed failures to choose subsequent content and tooling work. This evaluates retrieval and planning, not an unapproved application of changes.

The research inspected current source and external documentation. It did not change the docs application, run the proposed CLI recipes, or verify the deployed Stack Effect host.

## First-phase implementation scope

Follow-up research on October 1 examined the first three priorities before implementation. The proposed phase contains documentation publishing, visible agent entry points, and corrections to the existing workflow. Prerendering, sitemap generation, a full bundle, new task recipes, search APIs, MCP, and runtime catalog pinning remain deferred.

### Publishing design

There are 14 MDX content files, including the homepage and eight generated CLI references. The Builder is a separate interactive TSX route. Recommend publishing all content-backed pages, replacing the homepage workbench with a concise description and link, and retaining Builder as a linked tool rather than inventing a machine-readable interactive session.

Use `/index.md`, `/getting-started.md`, `/reference/cli.md`, and corresponding nested command URLs. Preserve `/use-with-coding-agents.md`. A manifest should own source path, route, title, summary, and index order. It should feed generation and discovery links; avoid an unrelated navigation redesign. Generate the reference text after the existing CLI reference generation. Restrict publication to this manifest, not every Markdown file in the repository.

[remark-mdx](https://mdxjs.com/packages/remark-mdx/) exposes syntax-tree nodes for JSX, module statements, and expressions. [remark-stringify](https://github.com/remarkjs/remark/tree/main/packages/remark-stringify) serializes Markdown trees. Recommend a parsed conversion with explicit handlers for the current components and no evaluation of arbitrary expressions. The relevant parser packages already appear transitively in `bun.lock`; implementation should declare direct dependencies for packages it imports.

| Source construct | Required text output |
| --- | --- |
| Layout divs | Preserve their children and remove layout attributes. |
| Homepage HTML heading and Link | Emit a Markdown heading and ordinary link. |
| BlueprintWorkbench | Describe its purpose and link to Builder. |
| DisclosurePanel | Preserve its title, description, and collapsed prerequisites. |
| AnsiTerminal | Decode static literal input, remove terminal color sequences, and retain output in a fenced block. |
| Generated MDX comments | Omit the comment from published text. |
| Code fences containing imports or JSX | Preserve as code, without interpreting their contents. |
| Mermaid code fence | Preserve the diagram source and its surrounding explanation. |

Unknown custom components or meaningful dynamic expressions should produce a clear build error instead of silently losing content. Convert internal documentation links to absolute Markdown counterparts, preserving anchors. Keep registry JSON, schema, Builder, and external links pointed to their actual resource types.

The [current llms.txt proposal](https://llmstxt.org/) labels itself v2 and recommends alternate Markdown and describedby index link relations. Add these to page discovery and hosting headers where useful. Because the app remains client-rendered in this phase, HTTP links can expose discovery information without waiting for the browser app. Keep llms.txt short, with the agent guide first and grouped links to published text.

Extend the existing Vite publisher for both development requests and production assets. Confirm assets land in React Router's client build output. Serve exact paths with GET and HEAD, accept query strings without treating them as new pages, and return 404 for missing Markdown assets before the Vercel SPA fallback. Keep emitted output, copied guide text, and development responses consistent. Avoid bundling every page's text into the browser to support optional copy actions.

### Guide corrections established by source

The [command wiring](https://github.com/lloydrichards/stack-effect/blob/main/apps/cli/src/command.ts) confirms that `schema --root` uses saved project sources. Add the root argument to the existing example. Greenfield discovery can select explicit sources through repeated catalog flags, and greenfield Plan input can select them through `config.catalogs`.

[Plan input parsing](https://github.com/lloydrichards/stack-effect/blob/main/apps/cli/src/commands/plan.ts) preserves saved catalogs when an overriding stdin config omits `catalogs`. An explicit stdin catalog set becomes the effective source selection, and catalog flags must match it. Explain this exception to general config precedence.

Both structured Plan formats already report `sources` with name, URL, digest, and freshness, plus trust `notes`. The guide should inspect and record these fields and detect source changes between separate llm and raw invocations. The schema command has no source digest metadata, so current outputs cannot prove identical catalog bytes between discovery and planning. No new runtime feature is required to explain that boundary accurately.

### Product decisions to settle

1. Should the short handoff prompt support both new and existing repositories, or focus on existing-project planning?
2. Should the homepage agent entry be a secondary link beside the main Builder workflow, or an equally prominent alternative?
3. Should the guide retain mandatory approval for edits and separate Finalize approval, or respect authorization already supplied by the user?
4. Should changed source digests require fresh discovery and review? How should disclosed cached sources affect the workflow?
5. Should this phase add Copy Markdown to every page or retain it only on the agent guide while providing ordinary text links elsewhere?

Recommend a general handoff prompt with one existing-project worked example, a secondary homepage entry, respect for existing authorization, a stop and refreshed review on catalog changes, disclosed cache freshness, and ordinary Markdown links with copy behavior decided separately. These recommendations are not accepted decisions yet.

### Verification scope

During implementation, test conversion against the actual constructs above, including terminal output and code-fence preservation. Check manifest coverage, unique URLs, emitted asset coverage, and llms.txt links. Exercise exact development responses, GET and HEAD, missing-file behavior, and source changes. Build the docs and check production response headers and routing on a preview before describing hosting as verified.

Reuse existing controlled catalog fixtures for CLI verification. Relevant source evidence includes `catalogSources.contract.test.ts` for stdin catalogs and inherited sources, and source-cache tests for freshness. A source-digest comparison example should use the existing Plan output rather than claiming a catalog snapshot capability.

The follow-up was read-only for application code. No publishing converter, bootstrap prompt, UI change, or CLI behavior change has been implemented. A scoped fallow health attempt could not run because bunx could not write its temporary directory; perform the repository's required complexity analysis before implementation.

## Accepted decisions and implementation

The user accepted the six scoped decisions and authorized implementation. The bootstrap covers new and existing repositories; a supplied goal starts read-only planning, otherwise the agent asks for a goal. The homepage entry is secondary. The guide respects existing authorization, restarts discovery and planning on changed catalog digests, and allows compatible cached catalogs with freshness disclosure unless fresh network data is required. Every content page provides Copy Markdown and View Markdown.

`apps/docs/app/lib/docs-manifest.ts` owns public page metadata and text paths. `apps/docs/scripts/docs-markdown.ts` converts the same MDX sources used by the site into Markdown and the curated llms.txt index. It preserves fenced code, renders known UI components as text, and rejects unsupported dynamic content rather than silently dropping it. Add new content pages to the manifest and supply an explicit text representation for new MDX components.

The Vite plugin serves development text and emits static production assets. Vercel configuration publishes discovery links and content types and returns 404 for missing text paths before the SPA fallback. This replaces the guide-only virtual raw import. The Builder remains interactive with a Markdown summary linking to it.

Verification covers actual MDX conversion, manifest coverage, local GET and HEAD responses, missing text routes, discovery headers, copy success, retrieval failure, and clipboard retry. Production hosting must still be verified after deployment. CLI behavior is unchanged.

Implementation validation passed: repository formatting, lint, and type checks; 138 docs tests; 90 CLI tests including the catalog-source contracts; the docs production build; and OKF validation. All 15 built text assets matched freshly generated source output. Desktop and 390px mobile visual checks passed. Deployment response verification remains outstanding.
