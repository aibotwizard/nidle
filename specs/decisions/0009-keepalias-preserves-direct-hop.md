# ADR 0009 — `keepAlias` preserves the author's direct hop, not the chain tip

- **Status:** accepted
- **Date:** 2026-06-24
- **Deciders:** AO, PO
- **Related:** [../../plugin/src/shared/dtcg/resolve.ts](../../plugin/src/shared/dtcg/resolve.ts),
  [../../plugin/tests/resolve.spec.ts](../../plugin/tests/resolve.spec.ts),
  [../constitution.md](../constitution.md) §2 (M2), [../plan.md](../plan.md) §4 (M2)

## Context

DTCG allows alias chains: `button → accent.primary → color.blue.500`.
When the user picks **Keep as alias** on the reference-handling toggle
(M2), the plan must turn each alias-valued token into a Figma
variable-to-variable alias edge. There are two reasonable behaviours:

1. **Collapse the chain.** Resolve `button` directly to
   `color.blue.500` (the chain-tip, literal-bearing token). Each Figma
   variable then has a single alias edge straight to a primitive.
2. **Preserve the direct hop.** Resolve `button` to `accent.primary`
   (what the author actually wrote). The chain stays intact: three
   variables, two alias edges.

The first version of the resolver collapsed chains. The M2 fixture
test for cross-collection aliases (`button.background` →
`accent.primary` in `semantic/tokens.json` → `color.blue.500` in
`core/color.json`) caught it: with collapsing, `button.background`
ended up pointing at the **Primitives** collection rather than
**Semantic**, losing the intent the author encoded by going through
the semantic layer.

## Decision

The resolver walks the chain to **validate** it (terminates, no cycle,
type matches), but in `keepAlias` mode it returns
`{ kind: 'alias', targetName: <direct hop> }` — the immediate target
the author wrote, not the chain tip.

In `resolve` mode it does collapse to the chain-tip literal, because
the user explicitly opted out of preserving alias structure.

## Consequences

**Positive**

- The Figma variables panel mirrors the DTCG source structure. Hovering
  `button.background` shows it aliases the semantic token, which is the
  whole reason that semantic layer exists.
- Cross-collection aliases route through the correct collection. A
  Components-layer alias to a Semantic token stays a Semantic edge.
- Refactoring a primitive (`color.blue.500` → `color.brand.500`) ripples
  the way the author expects: every chain pointing through the semantic
  layer updates without touching the components layer.

**Negative**

- Figma renders chains as N edges, not 1. A user inspecting the variable
  panel sees more indirection than they would under the collapsed
  model. Acceptable — that indirection is the point of the semantic
  layer.
- The resolver still has to walk the chain (to validate termination and
  type), so we don't save the work; we just discard most of it. Cost
  is bounded by chain length, which is small in practice.

## Implementation note

`shared/dtcg/resolve.ts` walks via a cursor until it hits a
literal-bearing token, recording `seen` for cycle detection and
checking `cursor.type !== t.type` at the end. The returned
`targetName` is `aliasName(t.value)` — the original alias's first hop —
*not* `cursor.name`. The spec/conformance test that locks this in is
`tests/resolve.spec.ts > "preserves the author's direct alias hop"`.
