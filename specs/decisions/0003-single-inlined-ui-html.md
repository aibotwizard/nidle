# ADR 0003 — Single inlined `ui.html` bundle

- **Status:** accepted
- **Date:** 2026-06-23
- **Deciders:** AO
- **Related:** [../../plugin/build.mjs](../../plugin/build.mjs),
  [../../plugin/manifest.json](../../plugin/manifest.json)

## Context

Figma's plugin manifest names exactly one HTML file in `manifest.ui`.
Anything that HTML file pulls in (`<link>`, `<script src=…>`) must be
served from a network origin the manifest's
`networkAccess.allowedDomains` permits. ADR-0008 sets that list to
`["none"]` for the MVP.

Source is split across three files for editing ergonomics:
[../../plugin/src/ui/index.html](../../plugin/src/ui/index.html),
[index.css](../../plugin/src/ui/index.css),
[index.ts](../../plugin/src/ui/index.ts). esbuild produces `dist/ui.js`,
not `dist/ui.html`.

## Decision

The build step
([../../plugin/build.mjs](../../plugin/build.mjs)) emits a single
`dist/ui.html` by templating the source HTML with two sentinels:

- `/*__INLINE_CSS__*/` — replaced with the contents of `index.css`.
- `/*__INLINE_JS__*/` — replaced with the contents of esbuild's
  `dist/ui.js`.

The result is one self-contained HTML file. No `<link>` or
`<script src>` in the served document. Nothing leaves the iframe.

## Consequences

**Positive**

- Compatible with `networkAccess: ["none"]` — Figma will not block any
  resource because there are none to load (ADR-0008).
- A single file ships to Figma; reviewing what's actually delivered is
  trivial.
- Build output is deterministic from the three source files; CI can
  diff `dist/ui.html` directly.

**Negative**

- No HTTP caching of the JS bundle. Plugins reload the whole UI on each
  open, so caching wasn't going to help anyway.
- The Inter/JetBrains Mono webfonts referenced by the design asset are
  *not* loaded — the manifest forbids fetching `fonts.googleapis.com`.
  We fall back to system fonts (the CSS `font-family` declarations
  include `-apple-system, BlinkMacSystemFont, 'Segoe UI'`). UX should
  spot-check whether the fallback drifts visibly from the asset; if it
  does, a future ADR can decide between bundling the fonts as base64
  or widening `allowedDomains`.
