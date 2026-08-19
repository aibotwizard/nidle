# REQ-0005 — Tokens Studio support: scope ruling required

- **Status:** proposed — **awaiting PO decision**
- **Date raised:** 2026-08-18
- **Raised by:** architecture review
- **Milestone:** none — this is a scope question, not a work item
- **Related:** deviation D-5, ADR-0005,
  [../constitution.md](../constitution.md) §1

## Intent

Decide whether Tokens Studio combined exports are in scope. The code
supports them; the constitution says they are a non-goal. One of the
two is wrong, and only the PO can say which
([../agents/po.md](../agents/po.md)).

This document asks for a ruling. It does not propose an answer.

## The conflict

**The constitution says no.** §1 non-goals: *"Supporting token formats
other than W3C DTCG 2025.10. Older Tokens Studio format files are out
of scope."* ADR-0005 repeats it and adds: *"Users with Tokens Studio
archives must convert before importing. There are existing CLIs for
this conversion; we link to one rather than building it in."*

**The code says yes.** `expandTokensStudio` in
[parse.ts:82](../../plugin/src/shared/dtcg/parse.ts#L82) detects a
Tokens Studio combined export via root `$themes` or
`$metadata.tokenSetOrder` and expands each top-level key into its own
virtual file, specifically so aliases authored relative to set names
resolve correctly.

It is not an isolated helper. The collection routing table in
[toFigma.ts:74](../../plugin/src/shared/mapping/toFigma.ts#L74)
hardcodes Tokens Studio set-name conventions — `schemestatic`,
`scheme`, `appearance`, `elements`, `utilities`, `helpers` — which have
no meaning in plain DTCG. Support is woven into two stages.

Neither the constitution nor `docs/spec-deviations.md` mentioned this
until it was recorded as D-5 on 2026-08-18.

## What the PO is being asked

Pick one:

| Option | Consequence |
|--------|-------------|
| **Ratify** — amend constitution §1 to allow Tokens Studio combined exports | Support becomes intentional and testable. Needs a fixture (there is none today), an ADR superseding ADR-0005's exclusion, and a decision on how far support extends. |
| **Remove** — delete `expandTokensStudio` and the Tokens Studio set names from the routing table | Restores the stated scope. Breaks any user relying on it today. |
| **Tolerate** — leave as an accepted deviation, documented, untested | Cheapest now. Leaves two stages carrying undeclared behaviour that the next contributor will read as dead code and may delete. |

## Evidence for the decision

- **No fixture exercises it.** No directory under
  `plugin/tests/fixtures/` uses the combined format, so the expander →
  parse → plan path is entirely unverified end to end.
- **The expansion is silent.** Detected files are restructured with no
  console notice, so a user cannot tell it happened.
- **Virtual paths differ in shape from real ones.** Expanded files get
  paths with no `.json` suffix and often no directory. Theme detection
  groups by directory, so every flat set lands in the same bucket — and
  if two happen to share a shape, they are declared a themed group and
  become Figma modes. Untested.
- The requirement that started the project asks for behaviour *"similar
  to the design token studio plugin"*
  ([req-0001.md](req-0001.md)) — which may be why this was built, and
  is worth weighing against the non-goal it contradicts.

## Acceptance criteria

1. The PO records a ruling: ratify, remove, or tolerate.
2. Whichever is chosen, [../constitution.md](../constitution.md) §1 and
   [../../docs/spec-deviations.md](../../docs/spec-deviations.md) D-5
   agree with the code afterwards.
3. If ratified: a fixture, an ADR superseding ADR-0005's exclusion, and
   a console notice when expansion occurs.
4. If removed: the routing table drops the Tokens Studio set names in
   the same change.
