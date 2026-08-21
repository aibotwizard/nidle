# ADR 0015 — Tokens Studio combined exports ratified into scope

- **Status:** accepted (supersedes the exclusion in ADR-0005)
- **Date:** 2026-08-20
- **Deciders:** PO (ruling requested by
  [../requirements/req-0005-tokens-studio-scope.md](../requirements/req-0005-tokens-studio-scope.md)),
  AO
- **Related:** deviation D-5/D-8 in
  [../../docs/spec-deviations.md](../../docs/spec-deviations.md),
  constitution §1 (amended 2026-08-20), ADR-0011 (dimension grammar),
  ADR-0014 (semantic split)

## Context

req-0005 documented a conflict: `expandTokensStudio` and the Tokens
Studio set names in the routing table shipped in the code, while the
constitution named the format a non-goal. Testing against a real
Tokens Studio combined export (`assets/tokens.json`, 3 031 leaves)
showed the half-support losing 46% of tokens to the `$type` whitelist
and silently collapsing the Light/Dark scheme into a single mode.

## Decision

**Ratify** (req-0005 option 1). Tokens Studio combined exports are in
scope, with three mechanics:

1. **Numeric `$type` folding.** The Tokens Studio names `spacing`,
   `sizing`, `borderRadius`, `borderWidth`, `fontSizes`,
   `fontWeights`, `lineHeights`, `letterSpacing` are treated as DTCG
   `dimension`. Values run through the existing ADR-0011 grammar;
   values outside it (`150%`, `auto`) warn and drop under D-4.
   Composite and string types (`boxShadow`, `typography`, `text`,
   `fontFamilies`, `textDecoration`) remain unsupported with a
   per-token warning (D-1).
2. **Tolerant theme matching.** Sibling sets fold into modes when the
   `(name, type)` shape shared by *all* files covers ≥ 50% of the
   smallest file. Measured on the real export: true theme sets share
   ≥ 83% of the smallest sibling; unrelated sibling sets share 0%
   (each is namespaced), so the threshold has wide margins on both
   sides. A token missing from a mode gets that mode filled from the
   collection's default mode, one warning per fill — matching Tokens
   Studio's layered-set semantics.
3. **Nothing silent.** The set expansion emits a console notice
   (closes the D-5 open item), and a duplicate variable name landing
   twice in the same mode keeps the first definition and warns —
   previously the second write silently won.

## Consequences

- The real export now yields 2 848 / 3 031 parsed leaves (94%) and
  2 083 planned variables across six collections, with
  `Semantic-Color-Scheme [Light, Dark]`,
  `Semantic-Device [Desktop, Tablet, Mobile]` and
  `Semantic-Theme [Post, Cargo]` correctly moded. Every remaining
  drop is a warning in the import console.
- Fixture `plugin/tests/fixtures/tokens-studio/` covers the expander →
  parse → plan path end to end (req-0005 AC 3).
- String-type tokens (`text`, `fontFamilies`) stay out until Figma
  STRING variable support is designed; `%`-valued line-heights stay
  out until their FLOAT semantics are decided. Both are follow-up
  candidates, not part of this decision.
