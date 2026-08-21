# ADR 0017 — Acceptance-test UI fixes: wired upload button, visible parse errors, uncapped log

- **Status:** accepted
- **Date:** 2026-08-21
- **Deciders:** PO (tester feedback is the acceptance criterion), UX
- **Related:** constitution §3.3 (visual conformance gate), plan §5
  (M5 per-token error reporting), the design asset
  [Tokens to Variables.dc.html](../assets/figma-design-tokens-plugin/project/Tokens%20to%20Variables.dc.html)

## Context

Acceptance testing (Teams feedback, 2026-08-20) found three defects the
design asset does not answer for, because the asset only shows a happy
path with zero errors and four short demo log lines:

1. The "Upload folder" segmented button did nothing on click — only the
   dropzone opened the system picker.
2. A parse error that occurred at upload time was invisible on the final
   screen: the log seed on import-start wiped the warning lines, and the
   "parse warnings" stat counted only plan-time warnings, rendered in
   gray even when non-zero.
3. Long error messages were clipped (console lines never wrapped) and
   only the first 12 errors were echoed, the rest hidden behind
   "…and N more".

## Decision

Three deliberate deviations from a literal reading of the asset:

1. **The "Upload folder" seg button forwards its click to the hidden
   file input** — same behavior as the dropzone. (In the asset the seg
   buttons only switch the source form; with GitLab deferred to M3 the
   lone button would otherwise be inert.)
2. **Parse-time warnings survive to Step 4.** They are kept in reducer
   state (`intakeWarnings`), seeded into the console when an import
   starts, and counted into the "parse warnings" stat together with
   plan warnings. Both the errors and warnings stat counts render in
   the existing error tone `#ff8b8b` when non-zero, gray `#6b6b6b` when
   zero. (The asset shows a static gray `0` and its tone map has no
   error color; `#ff8b8b` was already established by the shipped
   console err tone — no new colors.)
3. **Error output is complete.** Console lines wrap
   (`overflow-wrap: anywhere`) and the 12-line error cap is removed;
   the console already scrolls.

## Consequences

- Constitution §3.2's "surfaced in the import console" promise now
  actually holds on the screen where users look for it — previously
  intake-level warnings were logged into state nobody rendered.
- Re-picking files replaces the stored warnings instead of appending,
  fixing a silent duplication.
- A pathological import (thousands of errors) renders one DOM line per
  error inside the scrolling console; accepted — completeness beat the
  hypothetical perf concern in acceptance testing.
- Covered by `tests/ui/machine.spec.ts` (seeding, replacement, no
  truncation) and `tests/ui/appFlow.spec.tsx` (button forwards to the
  picker; a malformed JSON upload shows on Step 4 with a red count).
