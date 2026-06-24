# ADR 0011 — Dimensions are coerced to px; 1rem = 16px

- **Status:** accepted
- **Date:** 2026-06-24
- **Deciders:** AO, PO
- **Related:** [../../plugin/src/shared/dtcg/parse.ts](../../plugin/src/shared/dtcg/parse.ts),
  [../../plugin/tests/parse.spec.ts](../../plugin/tests/parse.spec.ts),
  ADR-0005 (DTCG · 2025.10 only)

## Context

Figma Variables of type `FLOAT` store a unitless number. There is no
"unit" field — what the number means (px, percent, anything else) is
decided by the consuming code. By convention every Figma plugin and
plugin-emitting tool we have looked at treats dimension variables as
**px**.

DTCG · 2025.10 allows `dimension` `$value` to be any of:

- a number (`16`)
- a numeric string (`"16"`)
- a string with a unit (`"16px"`, `"1rem"`, `"1.5em"`)

The first version of our parser called `parseFloat` and returned the
result. `"16px"` → `16` (correct), `"1rem"` → `1` (wrong — it dropped
the unit and ignored that 1rem ≠ 1px). Tokens authored in rem (common
output of typography systems) silently became 1/16th of their intended
size, then displayed as `0` in Figma once we discovered the value was
also rounding to 0 in the variables panel for several common token
values.

The two reasonable behaviours:

1. **Reject all units.** Fail the import when any token uses a unit.
   Forces the source to be px-clean.
2. **Convert to px in the parser.** Accept px / rem / em; convert with
   a fixed 1rem = 16px base; warn on anything else.

The first preserves source fidelity but pushes the rem→px conversion
onto every team that authors tokens. The second meets Figma's
single-unit model where the source actually lives (DTCG often uses
rem for spacing and font sizes).

## Decision

Coerce dimensions to px at parse time. `dimensionToPx`:

- numbers pass through;
- bare numeric strings pass through;
- `px` strings drop the unit;
- `rem` and `em` are multiplied by `REM_BASE_PX = 16`;
- anything else (`vw`, `pt`, `auto`, …) yields a parse warning and the
  token is dropped.

`em` is treated like `rem` because Figma has no cascading element
context to scope `em` differently. We accept the inaccuracy — `em` is
rare in design-token files, and the alternative (warning + drop) would
fail imports for tokens authored by tools that happen to emit `em`.

The base is hard-coded at 16. We do **not** expose it as a user
setting in the MVP: 16 is the W3C/CSS default that authoring tools
assume, and a configurable base would invite source/target drift
that's nearly impossible to debug later.

## Consequences

**Positive**

- Common DTCG sources (Tokens Studio, Style Dictionary outputs) import
  with no manual pre-processing.
- The variable values in Figma match what the designer typed in the
  source, modulo the documented 16× factor for rem/em.
- The unit-handling rule lives in one place (`dimensionToPx`) and is
  reused by both the parser and the future writer-side validation.

**Negative**

- Designers who author in 1rem ≠ 16px contexts (mobile-first systems
  with 14px root) will get the wrong values until they convert in source.
  Acceptable — we surface the convention in this ADR and in the parser
  warning message.
- `em` is silently mistreated. Documented above; alternative is worse.
- We lose round-trip fidelity: a token authored as `"1rem"` becomes `16`
  in Figma, and exporting back from Figma cannot recover `"1rem"`.
  Out of scope for the MVP (no export path exists).

## Implementation note

- `shared/dtcg/parse.ts` exports `dimensionToPx(raw)` and
  `REM_BASE_PX = 16`. The constant is exported (not just inlined) so
  fixtures and tests can refer to the same source of truth.
- The regex `/^(-?\d*\.?\d+)\s*(px|rem|em)?$/i` is deliberately strict.
  No scientific notation, no percent, no calc(). Anything ambiguous
  warns; we'd rather drop than guess.
- Conformance test: `parse.spec.ts > dimensionToPx (ADR-0011)`.
