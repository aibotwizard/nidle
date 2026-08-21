# Specification Deviations

This file records any intentional deviations from the W3C DTCG 2025.10 format or project design assumptions.

Required by [constitution.md](../specs/constitution.md) §3.2: every
deviation is listed here with a one-line reason **and** surfaces in the
import console as a warning, never as a silent drop. Detailed behaviour
is specified in [specs/specification.md](../specs/specification.md).

| # | Deviation | Reason | Console surfaced |
|---|-----------|--------|------------------|
| D-1 | Only `$type` values `color`, `dimension`, `number`, and `text` (ADR-0016) are supported. Composite types (`shadow`, `typography`, `gradient`, `border`, `transition`, `strokeStyle`, `duration`, `cubicBezier`, …) are skipped. | Figma Variables have no composite type; how to represent them is an open product question (roadmap M7). | Yes — `unsupported $type "x" (supported: color, dimension, number, text)` |
| D-2 | `dimension` values are coerced to px with a fixed `1rem = 16px`. | Figma `FLOAT` variables store a unitless number with no unit field; 16 is the CSS/W3C default authoring tools assume. ADR-0011. | Yes, for unsupported units — `dimension value must be a number or string with unit px / rem / em / unitless` |
| D-3 | `em` is treated identically to `rem`. | Figma has no cascading element context to scope `em` against; warning-and-dropping would fail imports from tools that emit `em`. ADR-0011. | **Yes** (since 2026-08-19) — `em treated as rem: "1.5em" → 24px`; the token is kept. |
| D-4 | Dimension units other than `px` / `rem` / `em` / `%` (`vw`, `pt`, `auto`, `calc()`, scientific notation) are rejected rather than guessed. | Ambiguous conversions are worse than a visible drop. ADR-0011; `%` moved to D-11 by ADR-0016. | Yes |
| D-5 | Tokens Studio **combined exports** are expanded into one virtual file per token set, detected via root `$themes` or `$metadata.tokenSetOrder`. | ~~Needs a PO ruling~~ **Ratified 2026-08-20** (req-0005 option 1, ADR-0015); constitution §1 amended to match. | **Yes** (since 2026-08-20) — `Tokens Studio combined export detected — expanded into N token sets`. |
| D-6 | ~~`number` strings parsed with `parseFloat`, accepting trailing garbage~~ **Resolved 2026-08-19**: number strings must match a strict numeric grammar; anything else warns and drops the token. | Was unintentional; fixed under req-0003. | **Yes** |
| D-7 | Under `keepAlias`, alias chains are preserved at the author's direct hop rather than collapsed to the chain tip. | Deliberate: collapsing routes a Components→Semantic alias into Primitives and loses the reason the semantic layer exists. ADR-0009. | n/a — intended output, not a drop |
| D-8 | Tokens Studio numeric `$type` names (`spacing`, `sizing`, `borderRadius`, `borderWidth`, `fontSizes`, `fontWeights`, `lineHeights`, `letterSpacing`) are folded into DTCG `dimension`. | These are not DTCG types; folding them reuses the ADR-0011 grammar so numeric TS tokens import as FLOAT variables. ADR-0015. | Tokens are kept; values outside the grammar warn under D-4. |
| D-9 | Theme siblings match on ≥ 50% shared shape (of the smallest file) instead of exact equality; a token missing from a mode has that mode filled from the collection's default mode. | Real Tokens Studio theme sets drift (layered-set semantics); exact matching silently collapsed Light/Dark into one mode. ADR-0015. | **Yes** — one `missing in mode "X" — value filled from mode "Y"` warning per fill, and duplicate same-mode definitions warn `first definition wins`. |
| D-10 | Tokens Studio string `$type` names (`text`, `fontFamilies`, `textDecoration`, `other`) are folded into an internal `text` type and emitted as Figma `STRING` variables. | These are not DTCG types, but dropping them broke every alias pointing at them. ADR-0016. | Tokens are kept; non-string values warn and drop. |
| D-11 | `%` dimension values convert to unitless fractions (`150%` → 1.5). | CSS unitless line-height convention; rejecting them dropped the tokens plus 19 aliases pointing at them. ADR-0016. | **Yes** — `percent treated as a fraction: "150%" → 1.5` per token. |

## Open items

- ~~D-5 requires a PO decision.~~ Resolved 2026-08-20: ratified into
  scope (req-0005, ADR-0015) and the expansion now emits a console
  notice.
- ~~D-3 and D-6 are silent.~~ Resolved 2026-08-19 (req-0003): D-3 now
  emits a conversion notice, D-6 warns and drops.
- ~~String-type tokens and `%`-valued line-heights remain
  dropped-with-warning.~~ Resolved 2026-08-20 (ADR-0016): both import
  now (D-10, D-11). Composite types (D-1) remain the only open
  category, pending the roadmap-M7 product decision.
