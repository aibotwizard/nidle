# REQ-0002 — Deterministic, source-faithful import

- **Status:** partially delivered — FR-106 closed by ADR-0013 and
  FR-906 closed by the shared validator (both 2026-08-19); only FR-514
  (separator ↔ upsert interaction) remains open, pending the re-key vs.
  warn decision (acceptance criterion 4)
- **Date raised:** 2026-08-18
- **Raised by:** architecture review
- **Milestone:** remediation — [../roadmap.md](../roadmap.md) §3
- **Closes:** FR-106 ✅, FR-906 ✅, FR-514
- **Related:** ADR-0004, ADR-0013, [../architecture.md](../architecture.md) §7.1

## Intent

The same token files must produce the same Figma variables — regardless
of how the files arrived, and regardless of what changed between runs.

Today they do not. Three inputs that should be irrelevant to the output
are not: whether the user dropped or picked the folder, whether the
separator setting changed since the last run, and whether stored
settings were readable.

## Why now

**Wrong output, no error shown.** This is the failure mode that costs
users the most trust: nothing looks broken.

### 1. Drop and pick disagree about the path shape (FR-106)

`intake/dataTransfer.ts:32` built a relative path starting from the
dropped folder itself; `intake/fileReader.ts:40` unconditionally
stripped the first path segment, which was correct for the picker (the
browser prepends the chosen root) and wrong for a drop. (Both files
were replaced by `io/intake.ts` in ADR-0013; kept here as the record.)

| Action | Path produced | After strip | Collection |
|--------|--------------|-------------|-----------|
| Pick folder `tokens/` | `tokens/core/color.json` | `core/color.json` | Primitives ✅ |
| Drop folder `tokens/` | `tokens/core/color.json` | `core/color.json` | Primitives ✅ |
| **Drop folder `core/`** | `core/color.json` | `color.json` | **fallback** ❌ |

The third row loses the folder that drives collection routing. The
user gets variables in the wrong collection and a warning that reads
like a source problem, not a plugin problem.

Neither module states the contract. The flow test hardcodes
`webkitRelativePath = "tokens/" + path`, encoding the picker's shape,
so the drop producer is never exercised.

### 2. A separator change duplicates every variable (FR-514)

Upsert matches on `(collection, name)` (ADR-0004). The separator
setting changes `name`. So switching `slash` → `dot` makes every
existing variable unmatchable, and a second import doubles the file
instead of updating it — the exact outcome ADR-0004 was written to
prevent. ADR-0004 names this in its negative consequences and leaves
it open.

### 3. Corrupt stored settings pass the sandbox unchecked (FR-906)

The UI validates settings against a type and enum whitelist. The
sandbox reads `figma.clientStorage` and casts behind a bare
`typeof raw === "object"` check. A corrupt value reaches the planner
and silently changes the output.

## Acceptance criteria

1. Dropping folder `X` and picking folder `X` produce **identical**
   plans, for `X` at any directory depth — including when `X` is itself
   the collection folder (`core/`).
2. Path normalisation has **one** owner, and the contract it guarantees
   is stated where the path is produced.
3. A test drives the **drag-and-drop** producer, not only the picker
   shape.
4. Re-importing after a separator change either updates the existing
   variables or warns the user **before** writing. Silent duplication is
   not an acceptable outcome. The choice between re-keying and warning
   is recorded as an ADR.
5. Settings read from `clientStorage` are validated against the same
   whitelist on both sides of the `postMessage` boundary; an invalid
   value falls back to its default.
6. Each of the above is pinned by a test that fails against today's
   build.

## Out of scope

- Any change to the routing table itself (§4.3.1 of
  [../specification.md](../specification.md)) — the rule is correct; the
  input to it is not.
- Making the theme→mode heuristic configurable (FR-609, parked).
