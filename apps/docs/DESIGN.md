---
name: Stack Effect Docs
description: A precise, code-forward documentation workbench for Stack Effect.
colors:
  spectral-signal-light: "oklch(0.44 0.12 174)"
  spectral-signal-dark: "oklch(0.79 0.125 174)"
  precision-paper: "oklch(0.98 0.003 255)"
  precision-paper-surface: "oklch(0.998 0.001 255)"
  workbench-ink: "oklch(0.145 0.004 255)"
  tool-surface: "oklch(0.195 0.005 255)"
  structural-rule-light: "oklch(0.86 0.007 255)"
  structural-rule-dark: "oklch(0.33 0.008 255)"
  muted-text-light: "oklch(0.49 0.012 255)"
  muted-text-dark: "oklch(0.68 0.008 255)"
  success: "oklch(0.62 0.17 155)"
  warning: "oklch(0.80 0.16 85)"
  destructive: "oklch(0.58 0.22 25)"
  info: "oklch(0.62 0.10 245)"
typography:
  display:
    fontFamily: "JetBrains Mono Variable, monospace"
    fontSize: "2.488rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "JetBrains Mono Variable, monospace"
    fontSize: "2.074rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "JetBrains Mono, JetBrains Mono Variable, monospace"
    fontSize: "1.728rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  subtitle:
    fontFamily: "JetBrains Mono, JetBrains Mono Variable, monospace"
    fontSize: "1.44rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  subheading:
    fontFamily: "JetBrains Mono, JetBrains Mono Variable, monospace"
    fontSize: "1.2rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.01em"
rounded:
  control: "6px"
  container: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.spectral-signal-light}"
    textColor: "{colors.precision-paper}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.workbench-ink}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "4px 10px"
  code-block:
    backgroundColor: "{colors.tool-surface}"
    textColor: "{colors.muted-text-dark}"
    rounded: "{rounded.control}"
    padding: "16px"
---

# Design System: Stack Effect Docs

## Overview

**Creative North Star: "The Organized Workbench"**

The current Stack Effect documentation is a quiet technical workspace. It uses
monospaced headings, precision-neutral surfaces, fine structural borders, and a
single spectral-teal signal to make dense developer material feel ordered rather than
ornamental. The interface assumes a capable reader and keeps the surrounding
chrome subdued so prose and executable examples remain central.

The system is refined and tool-like without becoming a systems console. Its
dark mode most directly expresses the workbench metaphor; light mode translates
the same hierarchy onto cool paper-like surfaces. This document records the
first implemented branding system for the redesigned identity.

**Key Characteristics:**

- Code-forward hierarchy with monospaced headings and terminal content.
- Precision Mono, low-chroma neutral surfaces in both themes.
- Flat tonal layering reinforced by fine borders.
- One spectral-teal accent for links, focus, selection, and active location.
- Restrained, functional transitions and documentation-first density.

## Colors

The palette is a precision-monochrome foundation with a sparse spectral-teal signal and
semantic colors reserved for technical status.

### Primary

- **Spectral Signal:** Marks links, focus rings, active navigation, highlighted
  code, and primary actions. Its blue-green hue connects the docs to the CLI;
  its rarity separates orientation from decoration.

### Neutral

- **Precision Paper:** The near-white light-mode canvas.
- **Precision Paper Surface:** A slightly brighter light-mode layer for sidebars,
  cards, popovers, and code-adjacent surfaces.
- **Workbench Ink:** The dark-mode canvas and darkest foreground relationship.
- **Tool Surface:** The dark-mode layer for code, cards, and floating content.
- **Structural Rule:** The low-contrast border system that defines regions
  without introducing visual weight.
- **Muted Text:** Secondary navigation, metadata, and supporting labels.

### Semantic

- **Success:** Additions, successful status, and terminal success indicators.
- **Warning:** Caution states and terminal warning indicators.
- **Destructive:** Errors, removed code, and invalid states.
- **Info:** Informational highlighting distinct from the primary accent.

**The One Signal Rule.** Spectral teal identifies the next meaningful action or the
current location; it is not a decorative fill for large regions.

**The Semantic Color Rule.** Green, amber, red, and blue communicate status or
code meaning. They do not compete with the primary action hierarchy.

## Typography

**Display Font:** JetBrains Mono Variable (with `monospace` fallback)

**Body Font:** Inter (with system sans-serif fallbacks)

**Label/Mono Font:** Inter for interface labels; JetBrains Mono Variable for
headings and code; terminal output uses the native Menlo/Consolas stack.

**Character:** The pairing gives headings an explicit developer-tool character
while keeping long-form reading familiar and comfortable. The type scale follows
a 1.2 minor-third progression.

### Hierarchy

- **Display** (700, 2.488rem, 1.15): Page titles and the strongest prose entry.
- **Headline** (700, 2.074rem, 1.2): Major documentation sections.
- **Title** (600, 1.728rem, 1.25): Subsections and local hierarchy.
- **Body** (400, 1rem, 1.7): Long-form prose within a maximum measure of 72ch.
- **Label** (500, 0.8125rem, 1.5): Metadata and compact interface language.

**The Two-Voice Rule.** Monospace carries structure and executable material;
sans-serif carries explanation and operational labels.

**The Reading Measure Rule.** Long-form prose stays within roughly 72
characters so technical material remains scannable.

## Layout

The desktop shell uses three functional regions: a fixed navigation sidebar, a
centered reading column, and a fixed table-of-contents rail. The content column
is capped at 72ch, receives 24px horizontal padding by default, and expands to
48px on extra-large viewports. Major sections use a 48px vertical interval;
subsections use 32px.

Below the extra-large breakpoint, the right rail becomes a collapsible block
above the article. The sidebar uses its existing responsive sheet behavior on
small screens. Layout density remains compact in navigation and controls while
prose keeps generous line height and vertical rhythm.

**The Reading Path Rule.** Navigation and table-of-contents controls support the
article but never reduce its centered, uninterrupted reading measure.

## Elevation & Depth

The implemented system creates depth through tonal surface changes, fine
borders, sticky positioning, and a restrained translucent header. Dark mode
does not use ambient shadows. Light mode may use one restrained shadow only for
floating or raised structures where a border alone does not express separation.

**The Workbench Depth Rule.** Surfaces are separated primarily by tone and
structural rules. Shadows are a light-mode exception, never a default layer.

## Shapes

The dominant form language is subtly rounded and exact. Compact controls use a
6px radius; containers use 10px. Pills are reserved for statuses, and small
circular terminal indicators remain an intentional exception.

## Components

### Buttons

- **Shape:** Compact with a 6px radius, generally 32px high.
- **Primary:** Spectral Signal background with high-contrast foreground.
- **Hover / Focus:** Short color transitions, a one-pixel focus ring, and a
  one-pixel active press offset.
- **Secondary / Ghost:** Neutral tonal fills or transparent backgrounds with
  foreground-color changes.

### Inputs / Fields

- **Style:** Compact 32px fields with transparent or lightly toned backgrounds,
  one-pixel structural borders, and 10px horizontal padding.
- **Focus:** Border and two-pixel low-opacity ring shift to Spectral Signal.
- **Error / Disabled:** Semantic destructive rings for invalid state; reduced
  opacity and muted fills for disabled state.

### Cards / Containers

- **Corner Style:** Subtly rounded (6px controls, 10px containers).
- **Background:** Theme-specific paper, tool, and code surfaces.
- **Shadow Strategy:** None in dark mode; restrained and contextual in light
  mode. Tonal layers and borders provide the default separation.
- **Border:** One-pixel Structural Rule.
- **Internal Padding:** Usually 16px for code and prose containers.

### Navigation

The sidebar uses compact sans-serif labels and a monospaced `Stack Effect`
wordmark. Active items receive the accent-toned sidebar surface; inactive items
remain neutral until hover. The table of contents uses muted text with Spectral
Signal for the active heading. On small screens, navigation and local contents
collapse rather than competing with the article.

### Code Blocks and Terminal

Code blocks use the darkest or quietest local surface, monospaced type, a
one-pixel border, and 16px padding. Copy actions remain hidden until hover.
Syntax, diffs, focused lines, and annotations use semantic color without
changing the surrounding surface language. Terminal examples add only a thin
title bar and three small semantic indicators.

## Do's and Don'ts

### Do:

- **Do** keep prose centered within the 72ch reading measure.
- **Do** use Spectral Signal for navigation, focus, selection, and meaningful
  actions.
- **Do** use fine borders and tonal contrast to organize technical material.
- **Do** preserve clear light- and dark-mode semantic relationships.
- **Do** keep motion brief, functional, and respectful of reduced-motion needs.

### Don't:

- **Don't** turn the interface into a dense operational dashboard.
- **Don't** introduce decorative gradients, glass effects, or nested card grids.
- **Don't** use semantic status colors as competing brand accents.
- **Don't** tint general surfaces teal or turn the signal into decoration.
- **Don't** sacrifice body readability for an all-monospace interface.
