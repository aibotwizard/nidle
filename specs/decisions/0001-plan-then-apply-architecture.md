# ADR 0001 — Two-stage plan-then-apply architecture

- **Status:** accepted
- **Date:** 2026-06-23
- **Deciders:** AO
- **Related:** [../plan.md](../plan.md) §3, [../constitution.md](../constitution.md) §3.5

## Context

The plugin needs to (a) show the user an accurate preview in Step 3 before
anything mutates their Figma file, and (b) be testable without a Figma
runtime. The Figma Variables API only exists inside the sandboxed
`code.ts` context — the UI iframe cannot call it directly. Anything the UI
"knows" about the eventual output has to be re-derivable on the UI side.

Two shapes were considered:

- **Streaming**: UI sends one message per token; `code` creates variables
  as messages arrive. Preview would be a separate simulation.
- **Plan-then-apply**: UI computes a single `VariablePlan` value (a flat
  list of variable operations), shows it in Step 3, and sends the whole
  plan as one message to `code`, which applies it.

## Decision

The pipeline is `source → parse → resolve → plan → apply`. The UI owns
parse / resolve / plan. The sandbox owns apply. The only thing that
crosses the boundary on the way to Figma is one `applyPlan` message
containing the entire plan.

Only code inside `applyPlan` may call `figma.variables.*`. Nothing else
in the sandbox touches it.

## Consequences

**Positive**

- Step 3 preview is the same data structure the apply step consumes;
  what the user sees is what they get.
- Parser, resolver, and mapper are pure functions over JSON — testable
  in Node with `vitest`, no Figma mock needed. Confirmed by
  [../../plugin/tests/parse.spec.ts](../../plugin/tests/parse.spec.ts).
- New features that affect output (M2 aliases, M4 update semantics) plug
  in by changing the plan, not by adding new message types.

**Negative**

- For very large token sets, the full plan lives in memory on both
  sides. Not a concern at M1 scale; revisit if a real-world set blows
  past ~50k tokens.
- Progress reporting during apply is approximate — the plan is fixed
  before apply starts, so the UI can't show "discovered 3 new tokens"
  mid-run.
