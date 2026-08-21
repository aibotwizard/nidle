# ADR 0013 — UI deep-module rewrite: consolidated layout, settings in the reducer

- **Status:** accepted
- **Date:** 2026-08-19
- **Deciders:** AO, UX
- **Related:** refines [0012](0012-react-ui-layer.md) (React 19 runtime,
  unchanged); [../architecture.md](../architecture.md) §7.1 §7.7 §7.8;
  [../requirements/req-0002-deterministic-import.md](../requirements/req-0002-deterministic-import.md);
  [../plan.md](../plan.md) §2

## Context

A user-directed rewrite of `plugin/src/ui/` from the requirements and
the design asset. The prior layout (29 modules) had documented friction:
a 6-module settings stack serving one subscriber (§7.7), a 4-flag
lifecycle allowing illegal states with the decode duplicated across two
components (§7.8), a hook whose entire body renamed wire messages into
reducer actions, and the FR-106 drop/pick path defect living in the seam
between two intake files. The flow test asserted settings changes on the
store rather than the DOM.

## Decision

Fourteen modules replace twenty-nine. ADR-0012's core stands: React 19
function components, a single `useReducer`, esbuild with automatic JSX,
the inlined `ui.html` (ADR-0003).

1. **One state machine** (`state/machine.ts`). The wizard lifecycle is a
   discriminated union (`source | sets | preview | importing | done`);
   `importing && done` is unrepresentable. Settings live in the same
   reducer — the external store, its broadcast machinery, and the
   `useSettings`/`useSandboxMessages`/`usePlan` hooks are gone.
2. **Actions are a superset of the wire union** (`Action = ToUI | …`),
   so the transport listener is `addMessageListener(dispatch)` and the
   rename table disappears.
3. **`io/` owns the outside world**: `transport.ts` (postMessage
   multiplexer), `settingsIO.ts` (storage port, both adapters, and
   `mergeWithDefaults` as the single point of trust — the load now
   times out to defaults after 2s instead of hanging on a silent
   sandbox), `intake.ts` (both file producers and the path contract).
4. **The path contract is producer-normalized** (req-0002): every
   upload path is relative to the upload root and never contains the
   root itself. The picker strips exactly the segment the browser
   prepends; a single dropped directory *is* the root; multiple dropped
   items keep their own names. Dropping folder X ≡ picking folder X.
5. **Settings persist on the event, not in an effect** — the handler
   dispatches and saves the same merged value the reducer computes.

Presentational components and `index.css` carry over from the UX-gated
build; the Upload-only Step 1, "Continue"/"Close" labels, and
system-font fallback remain the ratified deviations from the design
asset (ADR-0006, ADR-0003).

## Consequences

**Positive**

- FR-106 closed by construction and pinned by producer-level tests
  (`tests/ui/intake.spec.ts`, drop ≡ pick).
- The real `postMessage` storage adapter is tested for the first time,
  including the silent-sandbox timeout (`tests/settingsIO.spec.ts`).
- The flow test asserts settings changes on the DOM and covers the
  sandbox-error path (FR-710) and plan recompute (FR-607).
- Roughly 260 fewer source lines for the same behaviour; no module
  exports a symbol with zero external consumers.

**Negative**

- `state/machine.ts` imports the pure `mergeWithDefaults` from
  `io/settingsIO.ts` — a state→io import tolerated because it is a
  validator, not I/O. Moving it would recreate a one-function module.
- `tests/ui/appState.spec.ts` and `tests/settingsStore.spec.ts` were
  superseded by `machine.spec.ts` and `settingsIO.spec.ts`; their
  behavioural assertions (log truncation, seed line, reset, hostile
  input) carried over, their dead-code pins (`importBlockedEmpty`,
  `hydrateFrom`) did not.
- M3's GitLab credentials will land as reducer state + `settingsIO`
  fields rather than in a standalone store; if that grows past a few
  fields, revisit this consolidation.
