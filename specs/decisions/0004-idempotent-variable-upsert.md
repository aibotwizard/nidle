# ADR 0004 — Idempotent variable upsert by `(collection, name)`

- **Status:** accepted
- **Date:** 2026-06-23
- **Deciders:** AO, PO
- **Related:** [../../plugin/src/code/index.ts](../../plugin/src/code/index.ts),
  [../constitution.md](../constitution.md) §2 (M4)

## Context

The M4 roadmap item is an "Update existing variables" toggle that lets
users match by name and overwrite rather than duplicate. The MVP does
not ship that toggle — but it does ship an import flow that real users
will run twice (typo, second pass, "let me try again"). If the second
run *duplicates* the first run's variables, the user has a mess to
clean up before they can try again.

Two questions, separable:

1. **Should the MVP's behaviour on re-run be duplicate or upsert?**
2. **Should there be a user-visible toggle for it?**

The PO's call is that the toggle is M4, but the **behaviour** for the
MVP should be the safe one.

## Decision

The MVP always upserts. The sandbox apply step
([../../plugin/src/code/index.ts](../../plugin/src/code/index.ts))
looks up existing variables by `(collectionId, name)` before creating;
if one exists, it calls `setValueForMode` on the existing variable
instead of `createVariable`.

There is no UI toggle in the MVP. The M4 toggle, when it lands, will
let users opt **out** of upsert and force fresh variables — not the
other way around.

## Consequences

**Positive**

- Re-running the plugin on the same token set produces the same
  variables, not duplicates. Safe by default.
- The M4 toggle becomes a smaller change — invert a boolean at the
  upsert site rather than introduce the upsert logic for the first
  time.
- Demos won't fill Figma files with `color-blue-500`,
  `color-blue-500 2`, `color-blue-500 3`.

**Negative**

- A user who *wants* duplicates (e.g. for an A/B comparison) cannot get
  them in the MVP. Acceptable — that's a niche need and they can
  rename the collection between runs.
- We're committed to keeping variable names stable across releases. If
  the slash-vs-dot separator setting (M4) changes how names are
  formatted, the same token will fail to match its previous
  incarnation and *will* duplicate. M4 needs to address this — either
  by re-keying or by warning the user.
