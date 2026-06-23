# ADR 0002 — Vanilla TypeScript UI, no framework

- **Status:** accepted
- **Date:** 2026-06-23
- **Deciders:** AO, UX
- **Related:** [../plan.md](../plan.md) §1, [../agents/ux.md](../agents/ux.md)

## Context

The design source of truth is an HTML/CSS/JS prototype:
[../assets/figma-design-tokens-plugin/project/Tokens to Variables.dc.html](../assets/figma-design-tokens-plugin/project/Tokens%20to%20Variables.dc.html).
The UX gate (constitution §3.3) requires pixel-fidelity to that asset.

Three options for the UI runtime:

- **React** (or any VDOM framework) — adds ~40kb gzipped, needs a JSX
  toolchain, adds a translation layer between the asset's idioms and the
  framework's.
- **A reactive micro-lib** (Preact, Solid) — smaller, but still a
  translation layer.
- **Vanilla TypeScript** with a tiny `render()` that diffs nothing and
  rebuilds the DOM on state change.

The plugin has four steps and one settings sheet. State transitions are
discrete and infrequent (clicks, not animation frames). The asset itself
is HTML+inline CSS; there is no component hierarchy to preserve.

## Decision

Use vanilla TypeScript. State lives in one module-level object; a single
`render()` function rebuilds the iframe's DOM tree from that state on
every change. No framework, no JSX, no client-side router.

esbuild ([../../plugin/build.mjs](../../plugin/build.mjs)) bundles both
entries to IIFE-format JS. No transpilation beyond TS → ES2017.

## Consequences

**Positive**

- The CSS from the asset transfers verbatim
  ([../../plugin/src/ui/index.css](../../plugin/src/ui/index.css))
  — UX can diff styles line-by-line against the asset without a
  framework-specific abstraction in the way.
- UI bundle is 22.4kb unminified, which inlines comfortably into a
  single `ui.html`.
- No build-step concept beyond "bundle TS". Onboarding a new contributor
  is one file ([../../plugin/build.mjs](../../plugin/build.mjs)).

**Negative**

- Rebuilding the whole tree on each render loses input focus and
  selection in `<input>` elements during state churn. M1's flow has no
  text inputs in the upload-only path, so this doesn't bite yet. The
  GitLab tab (M3) introduces text inputs and will need either a more
  granular render strategy or a `key`-keyed reuse table.
- No component-level encapsulation. If the UI grows beyond ~1.5k lines,
  re-evaluate.
