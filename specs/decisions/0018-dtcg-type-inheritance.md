# ADR 0018 — DTCG `$type` inheritance

- **Status:** accepted
- **Date:** 2026-08-21
- **Deciders:** AO (parse-stage change), PO (conformance gate)
- **Related:** ADR-0005 (DTCG 2025.10 only), ADR-0015 / ADR-0016
  (`$type` folding), [constitution.md](../constitution.md) §3.2

## Context

A tester's import reported 137 parse warnings of the form
`alias "{sizes.1}" → "sizes/1" does not match any token`, all pointing
into `core/` primitives that plainly exist in the source files.

The primitives were never parsed. `isLeaf()` required a node to carry
**both** `$type` and `$value`, so a token relying on a group-level
`$type` —

```json
{ "sizes": { "$type": "dimension", "1": { "$value": "1px" } } }
```

— failed the leaf test, was recursed into as if it were a group, and
produced nothing. No token, **and no warning**: a silent drop, which
[constitution.md](../constitution.md) §3.2 forbids outright. Every
alias pointing at those tokens then failed, and the reported reason
named the alias rather than the real cause.

DTCG §5.2.2 determines an untyped token's type as: the referenced
token's type if the value is a reference; otherwise the closest
ancestor group's `$type`; otherwise the token is invalid. §6.3 makes
group `$type` inheritable through nested groups. None of this was
implemented — and no fixture in the repo used group-level `$type`, so
the gap was invisible to the suite.

## Decision

1. **A node is a token as soon as it carries `$value`.** `$type` may
   come from the token, or be inherited from the closest ancestor
   group (the file root counts as a group).
2. **A reference outranks an inherited `$type`** (§5.2.2 order). An
   untyped alias token leaves `Token.type = null` at parse; the
   resolver fills it from the chain tip and skips the type-match check,
   since a token that declared no type has no expectation to violate.
   `ResolvedToken.type` is always concrete — nothing downstream of
   resolve sees `null`.
3. **A token with no determinable type warns and drops** —
   `no $type on the token or any ancestor group — type cannot be
   determined` — rather than vanishing.
4. **An unsupported inherited `$type` warns per token**, naming the
   inherited value, so a `$type: "shadow"` group reports each of its
   children under D-1 instead of going quiet.

## Consequences

- Token sets that type their primitive groups once — the common shape
  for generated `core/` files — now import instead of losing every
  primitive and cascading into alias failures.
- Warning counts move in both directions: alias failures disappear,
  while genuinely untyped or unsupported-typed tokens now surface
  where they were previously silent. This is the §3.2 behaviour.
- Tokens Studio `$type` folding (D-8, D-10) applies to inherited types
  too, since folding happens at the leaf.
- No new entry in [spec-deviations.md](../../docs/spec-deviations.md):
  this removes a deviation rather than adding one.
- `Token.type` is nullable between parse and resolve. This is the only
  stage boundary that carries it, and the null is a parse-stage
  "not yet known", not an error state.
