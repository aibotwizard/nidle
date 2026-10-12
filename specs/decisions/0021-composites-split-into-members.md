# ADR 0021 — Composites split into one variable per member

- **Status:** accepted
- **Date:** 2026-08-25
- **Deciders:** PO ("fix them", after being shown the traceability
  trade-off), AO (parse-stage expansion), UX (no UI change)
- **Related:** ADR-0019 (scalar type coverage), ADR-0020 (warning
  severity), [roadmap.md](../roadmap.md) §6 (M7, which this closes for
  the shipped sets), D-1 / D-14 / D-16 in
  [../../docs/spec-deviations.md](../../docs/spec-deviations.md)

## Context

After ADR-0019 four leaves in `assets/base` still failed to import, and
they were the last error-level warnings on that set:

| Leaf | `$type` | Value |
|------|---------|-------|
| `…/marker/border` | `border` | `{color, width, style}`, all three aliases |
| `transition-default` | `transition` | `{duration, delay, timingFunction}` |
| `…/label/transition/timing-function` | `cubicBezier` | `[0.25, 0.1, 0.25, 1]` |
| `…/marker/margin-right` | `dimension` | `"-{sizes.8}"` |

**Why they were unsupported.** A Figma variable is a scalar: its
`resolvedType` is one of `COLOR | FLOAT | STRING | BOOLEAN`, and each
mode holds exactly one value of that type or an alias to another
variable. There is no record type, no list type, and no arithmetic. So a
`border` has no single Figma value that can hold it, and `-{sizes.8}`
names a computation Figma cannot evaluate.

The roadmap (§6, M7) parked this pending evidence of how many composites
real sets contain. The evidence arrived: 3 in `assets/base`, and they
were the difference between "imports whole" and "doesn't".

## Decision

1. **Composites split into one variable per member,** at the parse stage,
   named after the member key kebab-cased:
   `…/marker/border` → `…/border/color`, `…/border/width`,
   `…/border/style`; `transition-default` → `/duration`, `/delay`,
   `/timing-function`. Members keep their own `$type`, so they flow
   through resolve and plan as ordinary tokens — which means **an alias
   inside a composite keeps its alias edge**, the property that made this
   preferable to serialising the composite into a string. The member
   tables live in `COMPOSITE_PARTS`; adding `shadow` or `typography`
   later is a table entry, not new machinery.
2. **`cubicBezier` becomes one STRING** holding the CSS function form,
   `cubic-bezier(0.25, 0.1, 0.25, 1)`. Four FLOATs would be four
   invented names, none meaningful alone; one string keeps the token's
   1:1 name and is usable verbatim by downstream CSS.
3. **A negated alias resolves and negates** (`"-{sizes.8}"` → `-8`),
   in both reference modes, with a notice that no alias edge is kept.
   The parser passes the expression through verbatim; only the resolver
   can look up the value being negated.
4. **An alias to a whole composite is refused** (D-16): the target's
   members aren't known until resolve, and there is no composite variable
   to alias. Members can be aliased individually.

### Accepted cost

Splitting invents names that do not appear in the source, which weakens
the "1:1 traceable back to that source" promise in constitution §1 —
`…/border/color` exists in Figma but not in the repo. Accepted because
the plugin is a **one-way** bridge: round-trip authoring is already a
declared non-goal, so the traceability that matters is "which source
token produced this variable", and `VariableOp.source` still records
exactly that (`file` + composite leaf path). The split is reported as a
notice per composite, naming the members created.

## Consequences

- `assets/base`: **748 tokens from 744 leaves** (two composites → three
  members each), **604 variables**, and **zero error-level warnings** —
  32 notices, all conversions or layered-theme fills. Every leaf now
  reaches Figma.
- `assets/w3c-tokens`: 134 / 134, unchanged.
- Verified through the real apply path in both reference modes: 604
  variables created, 0 write errors, every variable valued in every mode.
- `tests/assetCoverage.spec.ts` has an **empty skip list** for both
  corpora and a `composites` table asserting the exact member names, so a
  regression that stops splitting fails loudly rather than reappearing as
  a warning.
- Round-trip export (repo ← Figma) would now have to re-assemble members
  into a composite. Still a non-goal; noted so it is not rediscovered.
- `shadow`, `typography`, `gradient` remain unmapped — no shipped set
  uses them. `assets/tokens.json` has 67, which is the next candidate.
