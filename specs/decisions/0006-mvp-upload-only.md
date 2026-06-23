# ADR 0006 — MVP scope: upload-only, no settings, no GitLab

- **Status:** accepted
- **Date:** 2026-06-23
- **Deciders:** PO
- **Related:** [../constitution.md](../constitution.md) §2 (M1, M2, M3),
  [../plan.md](../plan.md) §0

## Context

The original M1 scope included a stubbed settings sheet and excluded
GitLab. The user, on review, asked for a *usable* MVP that drops both:
no settings sheet, no GitLab source. Upload-only.

The question this ADR records is **what the MVP is allowed to be
missing**, so the team doesn't re-litigate it every milestone planning
session.

## Decision

The MVP ships M1 minus two items:

| Item | Status | Milestone |
|------|--------|-----------|
| 4-step UI shell | **[implemented]** | M1 |
| Folder upload via system picker | **[implemented]** | M1 |
| DTCG parse (color/dimension/number) | **[implemented]** | M1 |
| Single "Primitives" collection output | **[implemented]** | M1 |
| Settings sheet | **[planned]** | M2 |
| GitLab source tab | **[planned]** | M3 |

The source segmented picker in Step 1 shows **only** the Upload tab
until M3 lands. The title-bar settings (hamburger) button is **hidden**
until M2 lands. Both are deliberate, not bugs.

The constitution roadmap (§2) and the plan (§0) now carry
**[implemented]** / **[planned]** markers per item so this scope is
machine-checkable, not just human memory.

## Consequences

**Positive**

- The MVP is genuinely usable end-to-end: pick a folder, click through
  4 steps, get Figma variables. Confirmed by the M1 fixture
  ([../../plugin/tests/fixtures/m1-primitives/](../../plugin/tests/fixtures/m1-primitives/)).
- We avoid shipping a settings sheet whose only knobs do nothing — the
  most common kind of trust-eroding UI.
- M2 and M3 become *adding* features, not *enabling* stubs. Cleaner
  diffs, clearer review.

**Negative**

- Users on internal GitLab who expected to wire up a repo today have
  to wait for M3. PO accepts this — the upload path is a real path
  too, and M3 will reuse the same parse/plan/apply pipeline (ADR-0001),
  so the wait is mostly UI work.
- The UI has two "ghost" affordances designed in the asset (settings
  button, GitLab tab) that aren't rendered today. UX must not
  reintroduce them speculatively — only when the matching milestone
  lights up.
