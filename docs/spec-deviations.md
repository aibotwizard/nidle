# Specification Deviations

This file records any intentional deviations from the W3C DTCG 2025.10 format or project design assumptions.

Required by [constitution.md](../specs/constitution.md) §3.2: every
deviation is listed here with a one-line reason **and** surfaces in the
import console as a warning, never as a silent drop. Detailed behaviour
is specified in [specs/specification.md](../specs/specification.md).

| # | Deviation | Reason | Console surfaced |
|---|-----------|--------|------------------|
| D-1 | The internal type vocabulary is `color`, `dimension`, `number`, `text`; every supported `$type` folds onto it (D-8, D-10, D-12, D-13). `border` and `transition` split into one variable per member (D-17); `shadow`, `typography`, and `gradient` are still skipped. | A Figma variable is a scalar (`COLOR \| FLOAT \| STRING \| BOOLEAN`, one value per mode), so a composite has no single representation. Member tables exist for the composites the shipped sets use; the rest await a set that needs them (ADR-0021, roadmap §6). | Yes — `unsupported $type "x" (supported: color, dimension, number, text)` |
| D-2 | `dimension` values are coerced to px with a fixed `1rem = 16px`. | Figma `FLOAT` variables store a unitless number with no unit field; 16 is the CSS/W3C default authoring tools assume. ADR-0011. | Yes, for unsupported units — `dimension value must be a number or string with unit px / rem / em / unitless` |
| D-3 | `em` is treated identically to `rem`. | Figma has no cascading element context to scope `em` against; warning-and-dropping would fail imports from tools that emit `em`. ADR-0011. | **Yes** (since 2026-08-19) — `em treated as rem: "1.5em" → 24px`; the token is kept. |
| D-4 | Dimension units other than `px` / `rem` / `em` / `%` (`vw`, `pt`, `auto`, `calc()`, scientific notation) are rejected rather than guessed. | Ambiguous conversions are worse than a visible drop. ADR-0011; `%` moved to D-11 by ADR-0016. | Yes |
| D-5 | Tokens Studio **combined exports** are expanded into one virtual file per token set, detected via root `$themes` or `$metadata.tokenSetOrder`. | ~~Needs a PO ruling~~ **Ratified 2026-08-20** (req-0005 option 1, ADR-0015); constitution §1 amended to match. | **Yes** (since 2026-08-20) — `Tokens Studio combined export detected — expanded into N token sets`. |
| D-6 | ~~`number` strings parsed with `parseFloat`, accepting trailing garbage~~ **Resolved 2026-08-19**: number strings must match a strict numeric grammar; anything else warns and drops the token. | Was unintentional; fixed under req-0003. | **Yes** |
| D-7 | Under `keepAlias`, alias chains are preserved at the author's direct hop rather than collapsed to the chain tip. | Deliberate: collapsing routes a Components→Semantic alias into Primitives and loses the reason the semantic layer exists. ADR-0009. | n/a — intended output, not a drop |
| D-8 | Tokens Studio numeric `$type` names (`spacing`, `sizing`, `borderRadius`, `borderWidth`, `fontSizes`, `fontWeights`, `lineHeights`, `letterSpacing`) are folded into DTCG `dimension`. | These are not DTCG types; folding them reuses the ADR-0011 grammar so numeric TS tokens import as FLOAT variables. ADR-0015. | Tokens are kept; values outside the grammar warn under D-4. |
| D-9 | Theme siblings match on ≥ 50% shared shape (of the smallest file) instead of exact equality; a token missing from a mode has that mode filled from the collection's default mode. | Real Tokens Studio theme sets drift (layered-set semantics); exact matching silently collapsed Light/Dark into one mode. ADR-0015. | **Yes** — one `missing in mode "X" — value filled from mode "Y"` **notice** per fill (ADR-0020: the token imported, so it is not an error), and duplicate same-mode definitions warn `first definition wins`. |
| D-10 | Tokens Studio string `$type` names (`text`, `fontFamilies`, `textDecoration`, `other`) are folded into an internal `text` type and emitted as Figma `STRING` variables. | These are not DTCG types, but dropping them broke every alias pointing at them. ADR-0016. | Tokens are kept; non-string values warn and drop. |
| D-11 | `%` values convert to unitless fractions (`150%` → 1.5) — on `dimension`, and on `number` since ADR-0019. | CSS unitless line-height convention; rejecting them dropped the tokens plus the aliases pointing at them. ADR-0016. | **Yes** — `percent treated as a fraction: "150%" → 1.5` per token. |
| D-12 | DTCG `fontFamily` and `strokeStyle`, plus the non-DTCG `fontStyle` seen in real exports, are folded into `text` and emitted as Figma `STRING` variables. | These are scalar strings with an exact STRING equivalent; dropping them also broke every alias pointing at them. ADR-0019. | Tokens are kept; non-string values warn under D-10's message. |
| D-13 | DTCG `fontWeight` and `duration` are folded into `number` → Figma `FLOAT`: weight keywords resolve via the spec table (`bold` → 700), durations are stored in **milliseconds** (`0.2s` → 200). | Figma `FLOAT` carries no unit and no keyword vocabulary; ms is the DTCG default spelling and the unit Figma prototyping uses. ADR-0019. | Tokens are kept; values outside either grammar warn — `font weight must be…` / `duration value must be…`. |
| D-14 | A negated alias (`"-{sizes.8}"`) is resolved to its target's literal and negated (`-8`), in both reference modes. The alias edge is not kept. | It is arithmetic, not a DTCG value, and Figma has no computed variables — so the choice is a literal or no variable at all. Rejected until 2026-08-25; resolved-with-notice since (ADR-0021). | **Yes** — `negated alias "-{sizes.8}" resolved to -8 — Figma cannot negate a reference, so no alias edge is kept` |
| D-16 | An alias to a **whole** composite (`"$type": "border", "$value": "{border.default}"`) is refused; members can be aliased individually. | The target's members are unknown until resolve, and there is no composite variable to alias. ADR-0021. | **Yes** — `a composite cannot be aliased, only its members can` |
| D-17 | `border` → `…/color`, `…/width`, `…/style`; `transition` → `…/duration`, `…/delay`, `…/timing-function`; `cubicBezier` → one STRING holding `cubic-bezier(a, b, c, d)`. | Splitting invents names absent from the source, weakening constitution §1 traceability — accepted because the bridge is one-way and members keep their alias edges, which serialising to a string would destroy. ADR-0021. | **Yes** — `border split into 3 variables (color, width, style)` per composite |
| D-15 | A `fontFamily` font stack (`["A", "B"]`) is flattened to its first family. | A Figma `STRING` variable holds one value and binds to one font; keeping the fallbacks would store an unusable CSS list. ADR-0019. | **Yes** — `font stack flattened to its first family "A"` when fallbacks are dropped. |

Every row above surfaces at one of two severities (ADR-0020): a
**warning** means the import lost the token; a **notice** means the token
imported and a conversion or theme fill is being reported. Step 3 lists
warnings per token in red, and collapses notices to one line per kind
(`28× tokens missing in mode "Desktop" — filled from mode "Tablet"`);
the Step 4 console keeps the per-token detail for both.

Not deviations, recorded to prevent re-litigation:

- The DTCG 2025.10 object form `{ "value": 0.75, "unit": "rem" }` is
  accepted for `dimension` and `duration` alongside the string form
  (ADR-0019) — conformance, not deviation.
- Tokens Studio `$metadata.json` / `$themes.json` sidecars are skipped
  by filename. They carry set order and theme wiring, never tokens, so
  there is nothing to drop.

## Open items

- ~~D-5 requires a PO decision.~~ Resolved 2026-08-20: ratified into
  scope (req-0005, ADR-0015) and the expansion now emits a console
  notice.
- ~~D-3 and D-6 are silent.~~ Resolved 2026-08-19 (req-0003): D-3 now
  emits a conversion notice, D-6 warns and drops.
- ~~String-type tokens and `%`-valued line-heights remain
  dropped-with-warning.~~ Resolved 2026-08-20 (ADR-0016): both import
  now (D-10, D-11).
- ~~`fontWeight`, `fontFamily`, `strokeStyle`, `duration`, and
  object-form dimensions are dropped, cascading into 50 broken
  aliases.~~ Resolved 2026-08-24 (ADR-0019): all import now
  (D-12, D-13).
- ~~Composites and the negated alias are dropped.~~ Resolved 2026-08-25
  (ADR-0021): `border` / `transition` split into members, `cubicBezier`
  becomes a STRING, the negated alias resolves to a literal. **Both
  shipped token sets now import every leaf**, with zero error-level
  warnings, gated by `plugin/tests/assetCoverage.spec.ts` (empty skip
  list). `shadow` / `typography` / `gradient` have no member table yet —
  unused by the shipped sets, 67 leaves in `assets/tokens.json`.
