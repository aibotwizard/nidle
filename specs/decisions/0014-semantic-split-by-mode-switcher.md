# ADR 0014 — Semantic collections split per mode switcher

- **Status:** accepted
- **Date:** 2026-08-19
- **Deciders:** AO, PO (via Jira ticket, see
  [../requirements/req-0006-openui-productionisation.md](../requirements/req-0006-openui-productionisation.md))
- **Related:** [../specification.md](../specification.md) §4.3.2a,
  ADR-0004 (upsert keys), constitution §2 M4 (amendment pending)

## Context

The M4 layout folded every semantic file into **one** Semantic
collection. With real OpenUI data that collection carries two unrelated
mode switchers at once — colour scheme (Light/Dark) and appearance
(Desktop/Tablet) — producing one collection with four modes where every
variable has values in only two of them. Figma renders the missing
half as create-time defaults (white), and the two switchers cannot be
toggled independently.

The Jira follow-up asks for two named collections
(`Semantic-Color-Scheme`, `Semantic-Appearance`) and, optionally, a
dynamic split for future switchers.

## Decision

Themed groups in the Semantic base collection each become their own
final collection. Recognition is by the group's **mode set**,
case-insensitive:

- `{light, dark}` → **Semantic-Color-Scheme**, modes ordered
  `[Light, Dark]` — first mode is the Figma default.
- `{desktop, tablet}` → **Semantic-Appearance**, ordered
  `[Desktop, Tablet]`.
- any other mode set → **`Semantic-<Dir>`**, named from the directory
  that grouped it (the optional "dynamic" AC is the general mechanism;
  the two named splits are just recognised orderings on top of it).

Non-themed semantic files remain in plain **Semantic**. Primitives and
Components are never split. `CollectionName` widens from a 3-literal
union to `string`; routing keeps a closed `BaseCollection` union.
Alias target collections are derived from the **final** assignment, so
cross-collection edges name the split collection.

Additionally (same ticket): the `component/` folder (singular) routes
to Components alongside `components/`.

## Consequences

**Positive**

- Each switcher is independently toggleable in Figma, and no variable
  has empty modes.
- Future switchers (e.g. density, brand) need no code change — they
  split dynamically by directory name.
- Emission order stays deterministic: Primitives → semantic-derived in
  detection order → Components.

**Negative**

- **One-time re-import migration.** Existing files hold variables in a
  collection named `Semantic`; the upsert key is `(collection, name)`
  (ADR-0004), so the first import after this change creates the new
  split collections instead of updating the old one. The old Semantic
  collection must be deleted manually once. Same class of issue as the
  separator rename (FR-514).
- The collection count is now data-driven; constitution §2's
  "three-collection layout" wording needs a PO amendment.
- Mode-set recognition is convention: a semantic group that *means*
  colour-scheme but uses modes `day/night` lands in `Semantic-<Dir>`
  rather than `Semantic-Color-Scheme`. Accepted — the OpenUI structure
  is fixed (ticket AC 1.2 rationale).
