# ADR 0016 — STRING variables and percent-as-fraction dimensions

- **Status:** accepted
- **Date:** 2026-08-20
- **Deciders:** PO ("implement what's left" after the ADR-0015
  ratification), AO
- **Related:** ADR-0015 (named both items as follow-up candidates),
  ADR-0011 (dimension grammar), deviations D-10/D-11 in
  [../../docs/spec-deviations.md](../../docs/spec-deviations.md)

## Context

After ADR-0015, two recoverable categories in the real Tokens Studio
export were still dropped: 111 string-valued tokens (`text`,
`fontFamilies`, `textDecoration`, `other`) and 4 `%`-valued dimensions
(`lineHeights` 100/120/150%, `letterSpacing` 0.12%) — and, as a
cascade, 23 aliases whose targets were exactly those dropped tokens.

## Decision

1. **STRING variables.** The internal type union gains `text`; the
   Tokens Studio names `text`, `fontFamilies`, `textDecoration`,
   `other` fold into it, and the plan/writer emit Figma `STRING`
   variables (empty strings are valid values). Aliases participate
   like any other type; the resolver's type check still rejects
   cross-type aliases (e.g. a `color` token aliasing a `text` token —
   two exist in the real export and warn as source-data errors).
2. **Percent as fraction.** The ADR-0011 dimension grammar accepts
   `%`, converting to a unitless fraction (`150%` → 1.5 — the CSS
   unitless line-height convention). Each conversion emits a
   D-3-style console notice; `auto` remains rejected.

## Consequences

- Real export: 2 963 / 3 031 leaves parse (97.8%), 2 176 variables in
  seven collections; every alias in the file resolves or warns with a
  reason.
- Remaining drops are exactly the composite types (`boxShadow` 41,
  `typography` 26) — the roadmap-M7 open product question (plan §6) —
  plus 3 `auto` spacings and the 2 source-data type errors above.
- The UI ↔ code message contract is unchanged; `VariablePlan` widens
  `resolvedType` with `"STRING"`, which older consumers never inspect
  exhaustively.
