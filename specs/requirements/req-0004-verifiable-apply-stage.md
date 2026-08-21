# REQ-0004 — Verifiable apply stage

- **Status:** proposed
- **Date raised:** 2026-08-18
- **Raised by:** architecture review
- **Milestone:** M6 seam hardening (proposed) —
  [../roadmap.md](../roadmap.md) §4
- **Closes:** FR-503, FR-504, FR-511, FR-512
- **Related:** ADR-0001, [../architecture.md](../architecture.md) §7.3

## Intent

The claim "the import worked" must rest on evidence. Today the apply
stage's four failure paths are the ones its tests structurally cannot
reach.

## Why now

This is not a defect report — the production code for these paths looks
correct. It is a statement that **nothing proves it**, and that the
gaps sit exactly where the consequences are worst.

All fourteen writer tests run through
[inMemoryFigmaApi.ts](../../plugin/src/shared/writer/inMemoryFigmaApi.ts),
which at 155 lines is larger than the 136-line production adapter it
stands in for. It re-implements Figma's object model rather than
recording calls, and it diverges from Figma on four behaviours — each
one disabling the production code written to survive it:

| Test adapter does | Production code it makes unreachable |
|---|---|
| hardcodes `defaultModeId` to `modes[0]` | the default-mode guard in `setupCollections` (FR-503) |
| `addMode` never throws | mode-limit fallback and `skippedModes` (FR-504) |
| `setValueForMode` accepts any type | the coercion-failure error path (FR-511) |
| `createVariable` never rejects a name | the create-failure error path (FR-512) |

The first row matters most. `setupCollections` carries a six-line
comment explaining that writing to a non-default mode leaves COLOR
variables rendering **white** — and the guard preventing it can never
take a distinguishing branch under test, because `.find()` on the fake
always returns `modes[0]`.

Meanwhile [figmaApiLive.ts](../../plugin/src/code/figmaApiLive.ts) has
**zero** tests, including `sameVariableValue` — a pure epsilon
comparison that is trivial to test — and a module-level `verifyCount`
shared across every adapter instance in a session rather than per
instance.

## Acceptance criteria

1. The test adapter can be **seeded** to reproduce each of the four
   divergences above: a non-first default mode, a mode-limit rejection,
   a type rejection, and a duplicate-name rejection.
2. FR-503, FR-504, FR-511, and FR-512 each have a test that fails when
   its guard is removed.
3. The white-COLOR-variable scenario — plan mode written to a
   reordered collection whose `defaultModeId` is not `modes[0]` — is
   covered explicitly.
4. `sameVariableValue` has direct unit tests.
5. `verifyCount` is per-adapter, not module-level, or is removed.
6. A new ADR records the rule: **a test adapter is a recorder or a
   seeded stub, never a re-implementation of the system it stands in
   for.** ([../architecture.md](../architecture.md) §10.6.)

## Out of scope

- Testing against live Figma. The `FigmaApi` port exists so the apply
  stage runs in Node; that stays true.
- Widening the seven-method port. Its narrowness is deliberate.
- The apply stage's internal seam collapse (`coerceValue`,
  `writeValues` parameters) — structural cleanup, tracked separately in
  [../roadmap.md](../roadmap.md) §4.3.
