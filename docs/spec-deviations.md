# Specification Deviations

This file records any intentional deviations from the W3C DTCG 2025.10 format or project design assumptions.

Required by [constitution.md](../specs/constitution.md) §3.2: every
deviation is listed here with a one-line reason **and** surfaces in the
import console as a warning, never as a silent drop. Detailed behaviour
is specified in [specs/specification.md](../specs/specification.md).

| # | Deviation | Reason | Console surfaced |
|---|-----------|--------|------------------|
| D-1 | Only `$type` values `color`, `dimension`, and `number` are supported. Composite types (`shadow`, `typography`, `gradient`, `border`, `transition`, `strokeStyle`, `duration`, `cubicBezier`, `fontFamily`, …) are skipped. | Figma Variables have no composite type; how to represent them is an open product question (roadmap M7). | Yes — `unsupported $type "x" (MVP supports color, dimension, number)` |
| D-2 | `dimension` values are coerced to px with a fixed `1rem = 16px`. | Figma `FLOAT` variables store a unitless number with no unit field; 16 is the CSS/W3C default authoring tools assume. ADR-0011. | Yes, for unsupported units — `dimension value must be a number or string with unit px / rem / em / unitless` |
| D-3 | `em` is treated identically to `rem`. | Figma has no cascading element context to scope `em` against; warning-and-dropping would fail imports from tools that emit `em`. ADR-0011. | **Yes** (since 2026-08-19) — `em treated as rem: "1.5em" → 24px`; the token is kept. |
| D-4 | Dimension units other than `px` / `rem` / `em` (`vw`, `pt`, `%`, `calc()`, scientific notation) are rejected rather than guessed. | Ambiguous conversions are worse than a visible drop. ADR-0011. | Yes |
| D-5 | Tokens Studio **combined exports** are expanded into one virtual file per token set, detected via root `$themes` or `$metadata.tokenSetOrder`. | Exceeds the declared scope: [constitution.md](../specs/constitution.md) §1 and ADR-0005 name the Tokens Studio format a non-goal. Shipped because aliases in these exports are authored relative to set names and would otherwise fail to resolve. **Needs a PO ruling** — either ratify it into scope or remove it. | **No** — expansion is silent. |
| D-6 | ~~`number` strings parsed with `parseFloat`, accepting trailing garbage~~ **Resolved 2026-08-19**: number strings must match a strict numeric grammar; anything else warns and drops the token. | Was unintentional; fixed under req-0003. | **Yes** |
| D-7 | Under `keepAlias`, alias chains are preserved at the author's direct hop rather than collapsed to the chain tip. | Deliberate: collapsing routes a Components→Semantic alias into Primitives and loses the reason the semantic layer exists. ADR-0009. | n/a — intended output, not a drop |

## Open items

- **D-5 requires a PO decision.** It is the only entry here that
  contradicts a stated non-goal rather than merely narrowing DTCG
  support.
- ~~D-3 and D-6 are silent.~~ Resolved 2026-08-19 (req-0003): D-3 now
  emits a conversion notice, D-6 warns and drops.
