MUST use /karpathy-guidelines skill for code

# Project governance — always loaded

The constitution is binding for every change. The plan and agent charters
define architecture, scope, and UX gates. All are imported below and are in
context for every session:

@specs/constitution.md
@specs/plan.md
@specs/agents/ao.md
@specs/agents/po.md
@specs/agents/ux.md

# Further reference (read on demand)

- [specs/requirements/req-0001.md](specs/requirements/req-0001.md) — the MVP requirement being implemented.
- [specs/decisions/](specs/decisions/) — ADRs; consult before changing anything architectural, add a new ADR when making such a decision.
- [docs/spec-deviations.md](docs/spec-deviations.md) — known, accepted deviations from the specs.

# Rules of engagement

- Constitution wins on any conflict; PO (specs/agents/po.md) is the only role that may amend it.
- Changes spanning more than one module in `plugin/src/` go through the AO charter; UI element changes go through the UX charter.
- Record architectural decisions as new ADRs in [specs/decisions/](specs/decisions/).
