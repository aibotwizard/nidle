# Architecture Decision Records

This folder is the durable log of significant decisions for the Tokens →
Variables plugin. Each ADR captures **context** (what forced the
decision), the **decision** itself, and its **consequences** — so a
future reader can tell why we chose what we chose without re-running
the conversation.

## Format

Short MADR. Frontmatter:

- **Status:** `proposed` · `accepted` · `superseded by ADR-NNNN` ·
  `deprecated`
- **Date:** ISO date the ADR was accepted
- **Deciders:** which agent(s) signed off (AO / UX / PO)
- **Related:** links to plan, constitution, code, prior ADRs

## When to write one

Write an ADR when a decision:

- constrains code structure across more than one file or stage, **or**
- closes off an alternative we'd otherwise re-discuss next milestone,
  **or**
- amends or interprets the constitution.

Day-to-day tactical choices (variable names, helper file locations,
test fixture format) do **not** get an ADR.

## When to supersede

ADRs are append-only. If a decision changes, write a new ADR that
references the old one and flip the old one's status to
`superseded by ADR-NNNN`. Don't edit history.

## Index

| # | Title | Status | Deciders |
|---|-------|--------|----------|
| [0001](0001-plan-then-apply-architecture.md) | Two-stage plan-then-apply architecture | accepted | AO |
| [0002](0002-vanilla-ts-no-framework.md) | Vanilla TypeScript UI, no framework | superseded by 0012 | AO, UX |
| [0003](0003-single-inlined-ui-html.md) | Single inlined `ui.html` bundle | accepted | AO |
| [0004](0004-idempotent-variable-upsert.md) | Idempotent variable upsert by `(collection, name)` | accepted | AO, PO |
| [0005](0005-dtcg-2025-10-only.md) | Pin to DTCG · 2025.10 as the only supported format | accepted | PO |
| [0006](0006-mvp-upload-only.md) | MVP scope: upload-only, no settings, no GitLab | accepted | PO |
| [0007](0007-three-agent-team.md) | Three-agent team: AO, UX, PO | accepted | PO |
| [0008](0008-network-access-none-in-mvp.md) | `networkAccess: ["none"]` in the MVP manifest | accepted (M3 amendment pending) | AO, PO |
| [0009](0009-keepalias-preserves-direct-hop.md) | `keepAlias` preserves the author's direct hop, not the chain tip | accepted | AO, PO |
| [0010](0010-async-writer-yields-per-progress-tick.md) | Async writer yields to the event loop on each progress tick | accepted | AO |
| [0011](0011-dimensions-coerced-to-px-rem-base-16.md) | Dimensions are coerced to px; 1rem = 16px | accepted | AO, PO |
| [0012](0012-react-ui-layer.md) | React UI layer | accepted | AO, UX |
