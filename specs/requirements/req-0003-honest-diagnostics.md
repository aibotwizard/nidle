# REQ-0003 — Honest diagnostics

- **Status:** delivered 2026-08-19 — all six acceptance criteria met
  (FR-710 via the UI rewrite; D-3 notice, D-6 strict grammar, and the
  single-owner monotonic progress budget via the remediation pass)
- **Date raised:** 2026-08-18
- **Raised by:** architecture review
- **Milestone:** remediation — [../roadmap.md](../roadmap.md) §3
- **Closes:** FR-710, FR-805, and deviations D-3, D-6
- **Related:** [../constitution.md](../constitution.md) §3.2,
  ADR-0010, [../architecture.md](../architecture.md) §7.9

## Intent

The user must always be able to tell what the plugin did, what it
skipped, and why. Constitution §3.2 already requires this — "surfaced
in the import console as a skipped-token warning, not a silent drop."
Three behaviours currently break that promise.

## Why now

The console is the only window into a run. When it under-reports, a
partial import looks like a complete one.

### 1. Two deviations are silent (D-3, D-6)

Both are listed in
[../../docs/spec-deviations.md](../../docs/spec-deviations.md) and
neither reaches the console:

- **`em` is converted as if it were `rem`.** A token authored `1.5em`
  becomes `24`. Deliberate (ADR-0011), but the user is never told the
  conversion happened.
- **`number` strings are parsed with `parseFloat`**, which accepts
  trailing characters — `"12abc"` silently becomes `12`. Unintentional;
  this should warn and drop, consistent with how malformed dimensions
  are handled.

Constitution §3.2 permits deviations. It does not permit quiet ones.

### 2. Progress percentages are not meaningful (FR-805)

Three modules emit progress on three unrelated scales and nothing owns
the budget:

| Emitter | What it posts |
|---------|--------------|
| `variableWriter` | `0`, once |
| `setupCollections` | a hardcoded `5`, **once per collection** |
| `writeValues` | a true `i/total` ratio |

A three-collection plan therefore posts three consecutive events all
claiming 5%. The bar is not monotonic and the number does not track
work done. ADR-0010 fixed *when* progress is flushed; it did not
allocate *what* the numbers mean.

### 3. The error path has no test (FR-710)

`errorReceived` — the only path that surfaces a sandbox failure to the
user — has zero coverage in either spec file. The one screen a user
sees when something has gone badly wrong is the one screen never
exercised.

## Acceptance criteria

1. Every entry in
   [../../docs/spec-deviations.md](../../docs/spec-deviations.md)
   marked "console surfaced: no" either emits a warning or is
   re-classified with a reason recorded in that table.
2. A `number` value that does not parse cleanly warns and drops the
   token, matching the `dimension` behaviour.
3. An `em`-authored dimension emits a one-line conversion notice.
4. Progress is **monotonic** across a whole import, and each phase has
   a declared share of the range. Pinned by a test asserting that
   emitted percentages never decrease.
5. Progress is emitted through a single owner rather than hand-threaded
   into each phase.
6. The sandbox-error path is covered by a test that asserts what the
   user actually sees.

## Out of scope

- Changing the 12-line error preview cap (FR-709) — it works.
- Per-variable progress ticks. ADR-0010 rejected these deliberately;
  the cadence stays at ~20 per import.
