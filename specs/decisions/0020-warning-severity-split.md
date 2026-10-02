# ADR 0020 — Warnings carry a severity; Step 3 shows both stages

- **Status:** accepted
- **Date:** 2026-08-25
- **Deciders:** PO (tester report: "I still get the error: 28 parse
  warnings"), AO (shared type + UI), UX (panel styling)
- **Related:** ADR-0015 / D-9 (theme-drift mode fills), ADR-0017
  (visible parse errors), ADR-0019 (scalar type coverage),
  [constitution.md](../constitution.md) §3.2

## Context

After ADR-0019, importing `assets/base` still showed a red
`28 parse warnings` panel on Step 3 — and all 28 were
`token "…" missing in mode "Desktop" — value filled from mode "Tablet"`.

That reading was wrong twice over:

1. **Nothing was lost.** `assets/base` uses Tokens Studio layered sets:
   `$metadata.json` orders `breakpoints/desktop` before
   `breakpoints/tablet`, and `tablet.json` (53 leaves) is a superset of
   `desktop.json` (25 leaves). The 28 extra tokens — `body`, `small`,
   `tiny`, `body-title` families — simply do not vary by breakpoint. The
   fill gives the Desktop mode the only value that exists, which is the
   correct import.
2. **The real problems were invisible on Step 3.** The panel rendered
   `plan.warnings` only, so the four genuinely dropped tokens (three
   composites, one negated alias) appeared nowhere before the import —
   they surfaced on the Step 4 console, after the point of no return.

Constitution §3.2 requires that conversions and drops both be visible.
It does not require them to look alike, and making them look alike cost
the panel its meaning: 28 red lines for a clean import, 0 red lines for
4 dropped tokens.

## Decision

1. **`ParseWarning` gains an optional `level?: "notice"`.** Absent means
   the import lost something — a dropped token, an unresolved alias, a
   refused value. `notice` means the token imported and a conversion or
   fill is being surfaced. Optional, so the field is additive: existing
   construction sites and the postMessage contract are unchanged.
   Marked `notice`: theme-drift mode fills (D-9), `em`→`rem` (D-3),
   `%`→fraction (D-11), font-stack flattening (D-15), and the Tokens
   Studio expansion notice (D-5).
2. **Step 3 shows both stages, in two panels.** The step answers "what
   will this import lose?", so `App` now merges the parse-stage warnings
   for the *selected* files with the plan-stage ones, and `StepPreview`
   splits them: `N parse warnings` in the existing red box, `M notices`
   in the same box muted (background `rgba(255,255,255,0.06)`, head
   `#999` — both already in the asset's palette).
3. **Notices collapse to one line per kind.** A notice also carries a
   `summary` — an aggregation key phrased to read after a count, e.g.
   `tokens missing in mode "Desktop" — filled from mode "Tablet"` (per
   mode pair) or `percent values treated as fractions`. `StepPreview`
   groups by it and renders `28× …`, because with conversions the
   interesting unit is the kind and its count; thirty near-identical
   lines say no more than two do. Dropped tokens still list per token —
   there, every name matters.
4. **Notices log dim, not red,** on the Step 4 console, which keeps the
   per-token detail, and the Step 4 `parse warnings` stat counts
   error-level warnings only.

## Consequences

- `assets/base` Step 3 now reads **4 parse warnings** (listed per token)
  and **29 notices** in two lines — `28× tokens missing in mode
  "Desktop" — filled from mode "Tablet"` and `1× percent values treated
  as fractions` — instead of 28 red warnings. The 4 name exactly the
  tokens that will not exist in Figma.
- `assets/w3c-tokens`: 0 / 0, unchanged.
- `State` gains `parseWarnings: ParseWarning[]` alongside the existing
  `intakeWarnings: LogLine[]`; the reducer replaces both on
  `filesLoaded`. The log keeps its own pre-rendered lines because the
  console is append-only and tone-based.
- `tests/assetCoverage.spec.ts` now asserts on `level` instead of
  matching reason strings: the set of error-level warnings must equal
  the documented skip list exactly, for both reference modes. A future
  change that silently reclassifies a drop as a notice fails that test.
