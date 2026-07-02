# ADR 0012 — React UI layer

- **Status:** accepted
- **Date:** 2026-07-02
- **Deciders:** AO, UX
- **Related:** supersedes [0002](0002-vanilla-ts-no-framework.md);
  [0003](0003-single-inlined-ui-html.md) (unchanged);
  [../plan.md](../plan.md) §1 §2

## Context

ADR-0002 chose vanilla TypeScript with a full-tree `render()` and named
its own exit ramps: re-evaluate past ~1.5k UI lines, and the full-tree
rebuild "loses input focus and selection in `<input>` elements", which
bites the moment M3's GitLab tab introduces text inputs. The UI layer
now sits at ~1k lines with no component-level encapsulation, and M3 is
the next milestone. A direct request to move the UI to React with
modular components triggered the re-evaluation early.

## Decision

The UI layer (`plugin/src/ui/`) is rewritten in React 19 with function
components, a single `useReducer` for wizard state, and hooks bridging
the existing framework-agnostic modules (`settings/`, `transport/`,
`intake/`), which stay framework-free by design. esbuild compiles TSX
with the automatic JSX runtime, defines `process.env.NODE_ENV` to
`"production"`, and minifies the UI bundle; the single inlined
`ui.html` mechanism (ADR-0003) is unchanged.

Everything outside `plugin/src/ui/` is untouched: the sandbox, shared
logic, and the `ToCode`/`ToUI` message contract.

## Consequences

**Positive**

- Input focus and selection survive re-renders (React reconciliation),
  removing ADR-0002's blocker for M3's text inputs.
- Component-level encapsulation: each screen and control is one module
  with typed props instead of a section of one 834-line file.
- React escapes text content natively; the hand-rolled `escapeHtml`
  and `el()` helpers disappear.
- `index.css` transfers verbatim and JSX reuses the same classNames,
  so the UX gate (constitution §3.3) still diffs 1:1 against the asset.

**Negative**

- The UI bundle grows from ~22 KB to ~200 KB minified. Still well
  within what Figma plugins ship inline; ADR-0003 holds.
- Two runtime dependencies (`react`, `react-dom`) where there were
  none; version bumps become a maintenance task.
- Contributors need JSX familiarity; the build is no longer "bundle TS"
  alone (JSX transform + NODE_ENV define).
