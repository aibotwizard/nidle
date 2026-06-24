# ADR 0010 — Async writer yields to the event loop on each progress tick

- **Status:** accepted
- **Date:** 2026-06-24
- **Deciders:** AO
- **Related:** [../../plugin/src/shared/writer/writeValues.ts](../../plugin/src/shared/writer/writeValues.ts),
  [../../plugin/src/shared/writer/variableWriter.ts](../../plugin/src/shared/writer/variableWriter.ts),
  [../../plugin/src/code/index.ts](../../plugin/src/code/index.ts),
  [../../plugin/tests/variableWriter.spec.ts](../../plugin/tests/variableWriter.spec.ts),
  ADR-0001 (plan-then-apply)

## Context

The writer was a synchronous `for` loop over the plan's variables. For a
small fixture (≤20 vars) this was fine; for the real Swiss Post token
set (1144 variables) two problems surfaced:

1. The UI progress bar sat at 0% the entire import, then jumped to 100%.
2. The user could not tell whether the plugin had hung or was still
   working — they reported "the loader is stuck".

The root cause is the Figma plugin sandbox: `figma.ui.postMessage`
batches calls until the sandbox yields control back to the host. A
synchronous loop that emits 20 progress events emits them all at once
after the loop returns — the iframe never sees the intermediate frames.

`writeValues` was already calling `onProgress` at ~5% intervals. The
only thing missing was a yield so the postMessage queue could flush.

## Decision

Make `writeValues` (and the orchestrating `write`) `async`. At every
progress emit point, `await new Promise(r => setTimeout(r, 0))` so the
sandbox yields. The `applyPlan` handler in `code/index.ts` `await`s the
returned promise before posting `done`.

The yield cadence matches the progress cadence (one yield per ~5%, max
20 yields per import). We do **not** yield per-variable: that would
turn a 1144-variable import into 1144 microtasks and visibly slow the
write without buying anything (the progress message stays the same).

## Consequences

**Positive**

- Progress bar animates as expected. The user gets continuous feedback
  during the ~20 progress windows of any import.
- The final error report reaches the UI even on long imports where the
  user might otherwise close the plugin. Critical for diagnosing
  silent per-variable failures.
- Tests can now observe mid-import state via `setTimeout(0)`. A new
  spec asserts ≥2 progress events arrive before `await write` resolves.

**Negative**

- The writer's signature changes from `WriteReport` → `Promise<WriteReport>`,
  rippling through every call-site (tests, `code/index.ts`). One-time cost.
- 20 extra microtasks per import. At the cadence Figma actually
  delivers messages (single-digit ms), this is well below perceptible.
- Anyone reusing `write()` from a sync context now needs `await` /
  `.then`. We accept this — the only production caller is the sandbox
  `onmessage` handler, which is already async-friendly.

## Implementation note

- `writeValues.ts` — loop is still synchronous between yields; we only
  await on the progress-tick branch. That keeps the per-variable hot
  path free of microtask overhead.
- `variableWriter.ts` — `setupCollections` and `upsertVariables` stay
  synchronous; both are O(collections) and O(variables) but call no
  per-variable Figma API. Only the value-write step needs to yield.
- The conformance test that locks this in is
  `variableWriter.spec.ts > "emits progress events incrementally, not all at the end"`.
