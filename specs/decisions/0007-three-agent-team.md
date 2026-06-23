# ADR 0007 — Three-agent team: AO, UX, PO

- **Status:** accepted
- **Date:** 2026-06-23
- **Deciders:** PO
- **Related:** [../agents/ao.md](../agents/ao.md),
  [../agents/ux.md](../agents/ux.md),
  [../agents/po.md](../agents/po.md),
  [../constitution.md](../constitution.md) §3.5

## Context

Multi-agent setups fail in predictable ways: agents overlap on
ownership, decisions are made by whichever agent was invoked last, and
the constitution drifts because nobody is its custodian. To avoid
that, this project assigns three agents with **non-overlapping
remits** and one tie-breaker.

Candidate remits considered:

- **Architecture** — module boundaries, the UI↔code message contract,
  milestone sequencing across files.
- **UX** — visual conformance to the design asset and interaction
  parity for the four steps and the settings sheet.
- **Product** — roadmap, scope defence against non-goals, Definition
  of Done sign-off.

Other remits (security, performance, docs) were considered and folded
into the existing three rather than spawning more agents:

- Security validation (constitution §3.4) is owned by AO — it's a
  cross-cutting architectural concern, not a separate role.
- Performance is implicit in the M5 polish milestone; no dedicated
  agent until the work warrants one.
- Docs are owned by whoever changes the thing being documented.

## Decision

Three agents, each with a frontmatter definition under
[../agents/](../agents/):

| Agent | Remit | Tie-break role |
|-------|-------|----------------|
| **AO** ([ao.md](../agents/ao.md)) | Architecture, message contract, milestone sequencing | none |
| **UX** ([ux.md](../agents/ux.md)) | Visual + interaction conformance to the design asset | none |
| **PO** ([po.md](../agents/po.md)) | Roadmap, scope, Definition of Done, constitution amendments | **breaks ties between AO and UX** |

The PO is the **only** agent who edits
[../constitution.md](../constitution.md). AO is the only agent who
edits [../plan.md](../plan.md) (PO can request edits, but AO writes
them). UX is the only agent who signs off constitution §3.3 visual
conformance.

A change cannot ship until all four gates in constitution §3.5 are
green; PO walks them in order and either signs off or sends the change
back.

## Consequences

**Positive**

- Every recurring question ("what milestone does this belong in?",
  "does this match the design?", "is the architecture right for this?")
  has exactly one agent who answers it. No "who decides" meta-debate.
- Tie-breaking is explicit. PO settles AO-vs-UX disputes by leaning
  toward shipping the current milestone, with the loser deferred to a
  follow-up.
- The agent files are real Claude Code subagent definitions
  (frontmatter `name`, `description`, `tools`) — they can be copied
  into `.claude/agents/` later if/when we want them invocable.

**Negative**

- Three agents is more coordination overhead than one. For a project
  this size that's worth it; for a smaller project it wouldn't be.
- New concerns that don't cleanly fit one remit (e.g. localisation,
  accessibility) need an explicit assignment, not a fourth agent by
  reflex. PO decides.
