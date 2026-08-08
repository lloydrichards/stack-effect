# Stack Effect

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is an experienced Effect developer building or prototyping a
full-stack TypeScript application. They already have an idea of what they want
to make and want to avoid rebuilding repository structure, boilerplate, and
cross-service wiring from scratch.

## Product Purpose

Stack Effect is a scaffolding CLI for composing full-stack Effect applications.
It turns a developer's selection of targets and capabilities into a coherent,
working repository so they can begin with the application idea rather than its
foundation.

Success means that a developer can understand what Stack Effect intends to add
and get a meaningful application working within seconds or minutes. A fully
working CLI chat application using AI modules across services is a representative
example of the value the product should make visible.

## Positioning

Stack Effect is the missing create-app-style entry point for full-stack Effect
development. Unlike a static template or an improvised LLM generation, it uses
an explicit catalog of compatible targets, modules, dependencies, and
contributions to compose the application the developer actually needs.

## Operating Context

Developers use `stack-effect init` to create a repository and `stack-effect add`
to grow it as requirements change. The product exposes a deliberate workflow:
Selection becomes a dependency-resolved Blueprint, which becomes a
repository-aware Plan, which is then Applied and Finalized.

The website helps developers evaluate the tool, understand that workflow, read
documentation, and reach the CLI. The authentic CLI workflow is the primary
proof of the product; existing VHS recordings can demonstrate it without
simulating an experience the product does not yet provide.

## Capabilities and Constraints

- Compose client, server, CLI, and shared-package targets with optional modules.
- Resolve cross-target dependencies and implications deterministically.
- Preview repository changes before writing through dry-run workflows.
- Add capabilities incrementally rather than requiring a fixed template.
- Preserve the distinct domain meanings of Selection, Blueprint, Plan, Apply,
  and Finalize.
- Keep the website demonstration representative and explicitly labeled as a
  dry run. It explains catalog composition but does not claim to write files or
  execute the CLI engine in-browser.

## Brand Commitments

- The product name and primary wordmark are `Stack Effect`.
- Use the real command, such as `npx stack-effect`, consistently so recognition
  translates into use.
- The Lucide Layers symbol is the current compact mark and favicon.
- The product should feel like an unofficial but recognizable member of the
  Effect ecosystem without impersonating the official brand.
- The core personality is precise, crafted, and approachable.
- The governing metaphor is an organized workbench combined with a refined
  creative tool, not an information-dense systems console.
- The voice is friendly and guiding. Landing and authored editorial surfaces may
  use the candid, metaphor-rich technical voice found on
  `lloydrichards.dev/labs`; controls and system feedback remain concise and
  operational.

## Evidence on Hand

- Existing documentation application: `apps/docs/app/`.
- Existing design tokens and themes: `apps/docs/app/app.css`.
- Existing typography roles: `apps/docs/app/components/tokens/typeface.ts`.
- Existing prose components: `apps/docs/app/components/tokens/prose-components.tsx`.
- The landing page includes a representative interactive dry run that explains
  Selection, Blueprint, Plan, and the runnable outcome without executing the
  CLI engine in-browser.
- The Stack Effect lab article at
  `https://lloydrichards.dev/labs/060-stack-effect-intro` provides authored
  product narrative and voice evidence.
- No testimonials, adoption metrics, or performance benchmarks have been
  confirmed for use as marketing evidence.

## Product Principles

1. Encode Effect-native conventions that experienced community members can
   recognize and trust.
2. Make useful applications work quickly because the underlying composition is
   coherent, not because architectural decisions are hidden.
3. Show developers what will be built and why through progressive disclosure.
4. Keep technical depth available without making complexity the default
   experience.
5. Prefer authentic product output and demonstrations over speculative claims.
