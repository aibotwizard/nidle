# ADR 0019 — DTCG 2025.10 object dimensions and the remaining scalar types

- **Status:** accepted
- **Date:** 2026-08-24
- **Deciders:** PO (tester report: "all tokens in `assets/base` and
  `assets/w3c-tokens` must load"), AO
- **Related:** ADR-0011 (dimension grammar), ADR-0016 (STRING variables,
  `%` as fraction), deviations D-12 … D-15 in
  [../../docs/spec-deviations.md](../../docs/spec-deviations.md)

## Context

Importing `assets/base` (the Swiss Post OpenUI set, 21 files, 744 leaves)
produced 146 warnings and only 477 variables. Two root causes, one of
them cascading:

1. **Object-form dimensions.** DTCG 2025.10 made `{ "value": 0.75,
   "unit": "rem" }` the canonical spelling of a dimension. `dimensionToPx`
   only accepted a number or a string, so all 9 `font/font-size/*`
   primitives were dropped at parse time — and the **50 component and
   semantic aliases** pointing at them then failed with
   `does not match any token`. One unsupported value shape produced 59
   of the 146 warnings.
2. **Scalar `$type`s still unsupported.** 70 further leaves declared
   `fontWeight` (52), `fontFamily` (4), `fontStyle` (4), `strokeStyle`
   (4), `duration` (3), or a true composite (3). Every one of the first
   five has an exact Figma-variable equivalent; only the composites do
   not.

## Decision

1. **Object form is a spelling, not a type.** A `{value, unit}` object
   flattens to the equivalent string (`"0.75rem"`, `"175ms"`) before the
   grammar runs, so `dimensionToPx` and `durationToMs` each keep one
   grammar covering both spellings. This is a conformance fix, not a
   deviation.
2. **Fold the five recoverable scalar types** onto the existing internal
   vocabulary rather than widening it:
   - `fontWeight` → `number` (FLOAT). Numeric values pass through;
     the spec's keyword table resolves `bold` → 700, `extra-light` → 200.
   - `duration` → `number` (FLOAT), stored in **milliseconds** (D-13),
     accepting `175`, `"175ms"`, `"0.2s"`, `{value, unit}`.
   - `fontFamily`, `fontStyle`, `strokeStyle` → `text` (STRING, D-12).
     A font stack flattens to its first family with a notice (D-15);
     an alias nested in a one-element stack survives the flatten, which
     the real set relies on.
   `DtcgType` stays `color | dimension | number | text`, so the mapping
   and writer stages are untouched.
3. **Two categories stay skipped, with better reasons.** True composites
   (`border`, `transition`, `cubicBezier`, `shadow`, `typography`,
   `gradient`) remain the open roadmap-M7 product question — decomposing
   them would invent variable names absent from the source, which is a
   PO call, not a parser call. A **negated alias** (`"-{sizes.8}"`) is
   arithmetic, not a DTCG value; Figma variables cannot express it, so it
   is rejected with a message that names that cause instead of the
   misleading "dimension value must be…" (D-14).
4. **Tokens Studio sidecars are not token files.** `$metadata.json` and
   `$themes.json` are skipped by filename rather than parsed and warned
   about — they never contained tokens, so the warning was pure noise.

## Consequences

- `assets/base`: 740 / 744 leaves parse, **596 variables** across five
  collections, 33 warnings — down from 146, and **zero** unresolved
  aliases. Warnings are now 28 theme-drift mode fills (D-9, real source
  drift), 3 composite skips, 1 negated alias, 1 `%` conversion notice.
- `assets/w3c-tokens`: 134 / 134 leaves, 134 variables, 0 warnings —
  unchanged.
- Verified end-to-end: both sets, both reference-handling modes, apply
  through the in-memory Figma API with 0 write errors and every variable
  valued in every mode of its collection. Gated by
  `tests/assetCoverage.spec.ts`, which fails if any source leaf stops
  reaching Figma without being listed as a skip.
- The four remaining skips are enumerated by path in that spec, so
  narrowing the list later is a visible diff.
