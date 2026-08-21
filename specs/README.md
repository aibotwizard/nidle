# Specs

The governing documents for the Tokens → Variables Figma plugin. Start
here.

## Reading order

| Read this | To learn | Owner |
|-----------|----------|-------|
| [constitution.md](constitution.md) | Mission, non-goals, ratified roadmap, validation gates | PO |
| [requirements/](requirements/) | The original intent (req-0001) plus one document per open requirement | PO |
| [specification.md](specification.md) | Exactly what the plugin does with a token file | AO |
| [requirements/feature-requirements.md](requirements/feature-requirements.md) | Every requirement, numbered, with its status and its test | PO |
| [architecture.md](architecture.md) | Module map, seams, invariants, current friction | AO |
| [roadmap.md](roadmap.md) | What ships next and in what order | PO |
| [plan.md](plan.md) | Milestone-by-milestone work breakdown | AO |
| [decisions/](decisions/) | Why things are the way they are — 12 ADRs | AO / PO |

## Which document answers which question

- *"What happens if I upload a file with `$type: shadow`?"* →
  [specification.md](specification.md) §3.1 and
  [../docs/spec-deviations.md](../docs/spec-deviations.md)
- *"Is feature X built, and what proves it?"* →
  [requirements/feature-requirements.md](requirements/feature-requirements.md)
- *"Where does this new code belong?"* →
  [architecture.md](architecture.md) §1 and §10
- *"Can we add feature Y?"* → [constitution.md](constitution.md) §1
  non-goals, then the PO
- *"Why was this done this way?"* → [decisions/](decisions/)
- *"What are we building next?"* → [roadmap.md](roadmap.md)

## Open requirements

| # | Requirement | Status |
|---|-------------|--------|
| [0001](requirements/req-0001.md) | Convert W3C DTCG tokens to Figma variables | delivered, less GitLab (M3) |
| [0002](requirements/req-0002-deterministic-import.md) | Deterministic, source-faithful import | proposed — **contains a live defect** |
| [0003](requirements/req-0003-honest-diagnostics.md) | Honest diagnostics | proposed |
| [0004](requirements/req-0004-verifiable-apply-stage.md) | Verifiable apply stage | proposed |
| [0005](requirements/req-0005-tokens-studio-scope.md) | Tokens Studio scope ruling | **awaiting PO decision** |
| [0006](requirements/req-0006-openui-productionisation.md) | OpenUI productionisation (Jira) | delivered in code; AC 2/3 outside this repo |

Full requirement-by-requirement status:
[requirements/feature-requirements.md](requirements/feature-requirements.md).

## Precedence

The constitution wins on any conflict. ADRs win over the specification
and architecture documents — where those disagree with an ADR, the
document is wrong and should be fixed. The specification describes the
**shipped build**; where behaviour and intent diverge, the divergence
is called out inline rather than smoothed over.

## Who may change what

| Document | Amended by |
|----------|-----------|
| `constitution.md` | PO only, explicit edit, one PR |
| `requirements/req-0001.md` | PO — stays short, user intent only |
| `requirements/feature-requirements.md` | PO for scope, AO for verification columns |
| `specification.md`, `architecture.md`, `plan.md` | AO |
| `roadmap.md` | PO ratifies; AO sequences |
| `decisions/` | Append-only. Supersede, never edit. |

Agent charters: [agents/ao.md](agents/ao.md) ·
[agents/po.md](agents/po.md) · [agents/ux.md](agents/ux.md)
