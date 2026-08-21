# Functional Specification — Tokens → Variables

The behavioural contract of the plugin: given DTCG token files in, what
comes out, and why. This document is **descriptive of the shipped
build** — where behaviour and intent diverge, the divergence is called
out rather than smoothed over.

- **Why** the product exists → [constitution.md](constitution.md)
- **How** the code is structured → [architecture.md](architecture.md)
- **What** is required, itemised and testable →
  [requirements/feature-requirements.md](requirements/feature-requirements.md)
- **When** each part lands → [roadmap.md](roadmap.md)

Governing decisions are recorded in [decisions/](decisions/) and are
cited inline as ADR-NNNN. Where this document and an ADR disagree, the
ADR wins and this document is wrong — file a fix.

---

## 1. Scope

The plugin reads W3C DTCG · 2025.10 token files and writes Figma
Variables. It is a one-way bridge: source → Figma. There is no export,
no round-trip, no editing of tokens inside Figma
([constitution.md](constitution.md) §1).

**Supported input:** a folder of `.json` files, chosen with the system
picker or dropped onto the plugin window.

**Produced output:** Figma variable collections routed from the folder
layout — `Primitives`, `Components`, and one collection per semantic
mode switcher (`Semantic-Color-Scheme`, `Semantic-Appearance`,
`Semantic-<Dir>`, plain `Semantic` for unthemed files, §4.3.2) — each
with one or more modes,
populated with `COLOR` and `FLOAT` variables and variable-to-variable
alias edges.

---

## 2. Input contract

### 2.1 File selection

Only files whose name ends in `.json` are read; everything else in the
folder is ignored silently. Each file is parsed as JSON. A file that
fails `JSON.parse` is reported as a per-file parse failure and the
remaining files still import — one bad file never aborts the run.

### 2.2 Path normalisation

Every file carries a **relative path from the upload root**, e.g.
`core/color.json`. That path is load-bearing: its first segment selects
the target collection (§4.3.1) and its directory groups files into
themes (§4.3.2).

The browser reports a path that includes the picked root folder itself
(`my-tokens/core/color.json`), so the first segment is stripped. See
[architecture.md](architecture.md) §7.1 for the invariant this creates
and the case where it currently misfires.

### 2.3 Document shape

A token file is a tree of **groups** (plain JSON objects) whose leaves
are **tokens**. A node is a token as soon as it has `$value`. Keys
beginning with `$` are metadata and are never walked as groups.

A token's `$type` need not be declared on the token itself. Following
DTCG §5.2.2 and §6.3, it is determined in this order:

1. the token's own `$type`;
2. otherwise, if `$value` is a reference, the type of the token it
   references;
3. otherwise, the `$type` of the **closest ancestor group** that
   declares one — groups inherit through nesting, and the file root
   counts as a group;
4. otherwise the token is invalid and warns
   `no $type on the token or any ancestor group — type cannot be
   determined` (ADR-0018).

Because rule 2 needs the whole token set, an untyped reference token
leaves parse with its type unset; §4.2 fills it in. An inherited
`$type` is folded (D-8/D-10) and range-checked at each token, so an
unsupported group type warns once per child rather than once per
group.

```json
{
  "color": {
    "blue": {
      "500": { "$type": "color", "$value": "#0d99ff" }
    }
  }
}
```

A token's **name** is the slash-joined trail of keys from the file
root: `color/blue/500`. The file name does not contribute to the token
name.

If a file's root is not a JSON object, the file is skipped with the
warning `file root is not a JSON object`.

### 2.4 Tokens Studio combined exports

A file is treated as a **Tokens Studio combined export** when its root
carries either a non-empty `$themes` array or a `$metadata.tokenSetOrder`
array. Each top-level key is then expanded into its own virtual file
named after the set key (e.g. `core`, `SchemeStatic/Light`), so token
names are not prefixed by the set key and aliases authored against set
contents resolve correctly.

> ⚠️ This behaviour **exceeds the declared scope**. ADR-0005 and
> [constitution.md](constitution.md) §1 declare the Tokens Studio format
> a non-goal. Recorded in
> [../docs/spec-deviations.md](../docs/spec-deviations.md).

Plain DTCG files are returned unchanged by this step.

---

## 3. Token model

### 3.1 Supported types

| `$type`     | Figma type | Notes |
|-------------|-----------|-------|
| `color`     | `COLOR`   | §3.2 |
| `dimension` | `FLOAT`   | coerced to px, ADR-0011 |
| `number`    | `FLOAT`   | unitless |

Any other `$type` — `shadow`, `typography`, `fontFamily`,
`duration`, `cubicBezier`, `strokeStyle`, `border`, `transition`,
`gradient` — produces the warning
`unsupported $type "<x>" (MVP supports color, dimension, number)` and
the token is **skipped, never silently dropped**
([constitution.md](constitution.md) §3.2).

### 3.2 Value forms

**`color`** — must be a string, or an alias. Accepted at write time:

- hex `#rgb`, `#rrggbb`, `#rrggbbaa`
- `rgb()` / `rgba()` with comma, whitespace, or `/` separators
- channels as `0–255` integers or `0–100%`; alpha as `0–1` or `%`

Channels are clamped to `0–1`. A non-string colour value warns with
`color value must be a string (e.g. "#0d99ff") or an alias`.

**`dimension`** — coerced to a px number at parse time (ADR-0011):

| Input | Result |
|-------|--------|
| `16` (number) | `16` |
| `"16"` | `16` |
| `"16px"` | `16` |
| `"1rem"` | `16` |
| `"1.5em"` | `24` |
| `"2vw"`, `"12pt"`, `"auto"`, `calc(…)` | warning, token dropped |

`1rem = 1em = 16px`, hard-coded, deliberately not user-configurable.
`em` is treated as `rem` because Figma has no cascading element
context. The accepted grammar is strict: no scientific notation, no
percent, no `calc()`.

**`number`** — a JSON number, or a string matching the strict numeric
grammar (`-?\d*\.?\d+`, whitespace-trimmed). Anything else — including
trailing garbage like `"12abc"` — warns with
`number value must be numeric or an alias` and drops the token.

### 3.3 Aliases

An alias is a string that starts with `{` and ends with `}`, at least
three characters long: `{color.blue.500}`. Aliases are valid for **any**
`$type` and are preserved verbatim by the parser so the resolver can
decide their fate.

The path inside the braces is **dot-separated** and is converted to the
internal slash form: `{color.blue.500}` → `color/blue/500`.

---

## 4. Transformation rules

The pipeline is `intake → parse → resolve → plan → apply`. Each stage
is specified below; the module map is in
[architecture.md](architecture.md) §3.

### 4.1 Parse

Walk each file's tree depth-first, carrying the closest declared
`$type` down as the inherited default (§2.3). For every leaf with a
supported `$type`, emit one token `{ name, type, value, file }` where
`name` is the slash-joined key trail and `value` is either a
normalised literal (§3.2) or a raw alias string (§3.3). An untyped
reference token is emitted with `type: null` for §4.2 to resolve.
Groups are recursed; `$`-prefixed keys are skipped.

Output is a **flat** token list, not a tree. Flatness is what makes
cross-file alias resolution tractable.

### 4.2 Resolve

Alias resolution operates over the **union of all files** — a token in
`semantic/light.json` can alias a token in `core/color.json`.

For each alias-valued token, the chain is walked transitively to
validate three things:

1. **It terminates** at a literal-bearing token.
2. **It contains no cycle** — the trail is tracked in a `seen` set.
3. **The chain tip's `$type` matches the source token's `$type`.**

A token that left parse untyped (§2.3 rule 2) is the exception to
check 3: it takes the chain tip's type instead of being matched
against it, since it declared no expectation to violate (ADR-0018).
After this stage every token's type is concrete.

Any failure produces a warning and the token is **dropped from the
output** (it will not appear in Figma):

| Failure | Warning |
|---------|---------|
| target missing | `alias "{x}" → "x" does not match any token` |
| cycle | `alias cycle: a → b → a` |
| type mismatch | `alias target "x" has type color, expected dimension` |

The resolved value depends on the **reference handling** setting:

- **`keepAlias`** (default) — the token becomes
  `{ kind: 'alias', targetName }` pointing at the **direct hop the
  author wrote**, *not* the chain tip. Given
  `button → accent.primary → color.blue.500`, `button` aliases
  `accent.primary`. This preserves the semantic layer's intent and
  keeps cross-collection edges routed through the right collection
  (**ADR-0009**).
- **`resolve`** — the token becomes a literal carrying the **chain
  tip's** value. Alias structure is discarded, which is what the user
  asked for by choosing this mode.

> ⚠️ The doc comment on `resolveTokens` still describes the superseded
> chain-collapsing behaviour ("resolves to a single alias on `c`").
> The implementation and ADR-0009 are correct; the comment is stale.
> Tracked in [architecture.md](architecture.md) §8.

### 4.3 Plan

The planner turns resolved tokens into a `VariablePlan` — the single
value that both drives the Step 3 preview and is applied to Figma
(**ADR-0001**).

#### 4.3.1 Collection routing

The **first path segment**, lowercased, selects the collection:

| First segment | Collection |
|---------------|-----------|
| `core`, `palette`, `figmaonly` | **Primitives** |
| `semantic`, `schemestatic`, `scheme`, `device`, `appearance`, `theme`, `elements`, `utilities`, `helpers` | **Semantic** |
| `components`, `component` | **Components** |
| anything else | **Primitives** + warning |
| *(no `/` in path — a flat upload)* | **Primitives**, silently |

The fallback warning reads
`unknown top-level folder "x" — defaulted to Primitives`. The flat-file
case is silent on purpose: it preserves the M1 walking-skeleton
behaviour where a bare folder of JSON files just works.

Routing lands every file in one of these three **base** collections;
§4.3.2 may then split the Semantic base into several final collections.
Collections are emitted in the order Primitives → semantic-derived
(in detection order) → Components, and a collection with no files is
omitted entirely.

#### 4.3.2 Theme → mode detection

Within one collection, files are grouped by **directory**. A directory
becomes a **themed group** when:

- it holds **more than one** file, **and**
- every file has an identical **shape** — the sorted set of
  `name:type` pairs matches exactly across all files, and is non-empty.

Each file in a themed group becomes one **mode**, named from its
basename with the `.json` stripped and the first letter capitalised:
`light.json` → `Light`.

A directory that fails either test yields one **single group** per
file, and those files contribute the single mode `Value`.

#### 4.3.2a Semantic split (ADR-0014)

Themed groups in the **Semantic** base do not fold into one collection;
each mode switcher becomes its own collection, recognised by its mode
set (case-insensitive):

| Mode set | Collection | Mode order (first = default) |
|----------|-----------|------------------------------|
| {Light, Dark} | **Semantic-Color-Scheme** | Light, Dark |
| {Desktop, Tablet} | **Semantic-Appearance** | Desktop, Tablet |
| anything else | **Semantic-<Dir>** (capitalised directory name) | file order |

Non-themed semantic files stay in the plain **Semantic** collection.
Primitives and Components theme groups are unaffected. Alias targets
always name the **final** collection, so a Components token aliasing a
scheme token points at `Semantic-Color-Scheme`, not `Semantic`.

Mode ordering: themed mode names are collected in file order, then
`Value` is appended if any single group exists. If a mode named
`default` (case-insensitive) exists anywhere but first, it is moved to
the front — **the first mode in the list is the collection's default
mode**, and Figma renders it in the leftmost column.

#### 4.3.3 Variable emission

One `VariableOp` per unique emitted name per collection. Names are
emitted with the configured **separator**:

- `slash` (default) — `color/blue/500`, matching Figma's own grouping
  convention in the variables panel.
- `dot` — `color.blue.500`.

The separator is applied at **plan** time, not parse time, so a
variable's name and its alias targets always use the same form and
round-trip cleanly.

Each op carries one entry per mode. When the same name appears in
several modes with **conflicting resolved types**, the first type wins
and the conflicting entry is skipped with the warning
`token "x" has conflicting types across modes (COLOR vs FLOAT)`.

Each op is tagged `createOrUpdate` when **update existing variables** is
on (default), or `create` when it is off.

#### 4.3.4 Alias target collection

An alias's target collection is derived from the **file that first
defined the target token name**, mapped through the routing table
(§4.3.1). Where a name is defined in several files — the normal case
for themed overrides — **first match wins**, scanning files in upload
order. Targets that resolve to no known file default to `Primitives`.

### 4.4 Apply

Applying the plan is a three-phase pass inside the Figma sandbox. Only
this stage may call `figma.variables.*` (**ADR-0001**).

**Phase 1 — collections and modes.** For each planned collection,
reuse an existing collection with the same name or create one. The
plan's first mode is renamed onto the collection's **`defaultModeId`**
— not its `modes[0]`, which can diverge once a user reorders modes.
Writing to a non-default mode leaves the default at its create-time
value, which renders COLOR variables white. Remaining modes are matched
by name or added.

If Figma refuses a mode — the mode cap on free and lower-tier plans —
the remaining modes for that collection are recorded as **skipped**, a
`modesLimited` flag is set, and the user is told to upgrade. Values
targeting skipped modes are then suppressed rather than reported as
per-token errors.

**Phase 2 — materialise variables.** All existing local variables are
listed in a single scan and indexed by `(collection, name)`. For each
op:

- **not found** → create.
- **found, `createOrUpdate`** → reuse the existing variable and
  overwrite in place. Re-running an import updates rather than
  duplicates (**ADR-0004**).
- **found, `create`** → leave untouched and record a per-token skip
  error.

**Phase 3 — write values.** Walk the plan a second time and set each
mode's value. Aliases are written as Figma variable alias edges, which
is only possible because phase 2 materialised **every** variable before
any value was written — the ordering is load-bearing.

Coercion at write time:

- alias → the target variable handle; a missing target yields
  `alias target "Collection::name" not found`.
- `COLOR` → `{r,g,b,a}` floats parsed from the colour string; failure
  yields `could not coerce value "x" to COLOR`.
- `FLOAT` → the number unchanged; a non-number yields the same
  `could not coerce` error.

Any exception thrown by the Figma API is caught per token and recorded;
one bad token never aborts the import.

**Progress.** The writer owns a single monotonic 0–100 scale: phase 1
advances within 0–10 (one event per collection), phase 3 within 10–100
at roughly 5% intervals (at most 20 events), and percentages never
decrease. The writer yields to the event loop on each phase-3 tick so
`figma.ui.postMessage` actually flushes to the UI mid-import
(**ADR-0010**). Without the yield the sandbox batches every message
until the loop returns and the bar jumps 0 → 100.

---

## 5. Settings

Three settings, persisted in `figma.clientStorage` under
`nidle.settings.v1` (migrated from the legacy `boppli.settings.v1` on first read). Nothing is written anywhere else
([constitution.md](constitution.md) §3.4).

| Setting | Values | Default | Effect |
|---------|--------|---------|--------|
| `refMode` | `keepAlias` \| `resolve` | `keepAlias` | §4.2 |
| `separator` | `slash` \| `dot` | `slash` | §4.3.3 |
| `updateExisting` | `true` \| `false` | `true` | §4.4 phase 2 |

Only keys that have been set round-trip through storage; missing keys
are filled from the defaults on read, so a settings-schema addition
does not break existing installs. Values are validated against a type
and enum whitelist on read — a corrupt or hostile stored value falls
back to its default rather than propagating.

Changing any setting recomputes the plan, so the Step 3 preview always
reflects what will actually be written.

The settings sheet also shows a **read-only** theme → mode mapping
derived from the plan's theme groups. Editing that mapping is not
implemented; the detection heuristic (§4.3.2) has not yet been observed
to misfire.

---

## 6. Output contract

For a given upload and settings, the plugin guarantees:

1. **Collection count** — one per non-empty routed collection:
   Primitives, one per semantic mode switcher (§4.3.2a), plain Semantic
   for unthemed semantic files, Components — in that order.
2. **Mode count** — per §4.3.2, with the first mode bound to the
   collection's default mode.
3. **Variable names** — exactly the DTCG key trail, joined with the
   configured separator. No prefixing, no case changes, no sanitising.
4. **Alias edges** — preserved at the author's direct hop under
   `keepAlias` (ADR-0009); absent under `resolve`.
5. **Idempotence** — re-running the same import with `updateExisting`
   on produces the same variables, updated in place, not duplicated
   (ADR-0004).

> ⚠️ Idempotence is keyed on `(collection, name)`, so **changing the
> separator setting between runs breaks the match** and duplicates
> every variable. Flagged as a known consequence in ADR-0004; not yet
> mitigated. See [roadmap.md](roadmap.md).

---

## 7. Diagnostics

Every skipped token surfaces in the import console. Nothing is dropped
silently ([constitution.md](constitution.md) §3.2).

**Plan warnings** carry `{ file, path, reason }` and are raised during
parse, resolve, and plan. Catalogue: unsupported `$type`, non-object
file root, malformed colour, malformed dimension, malformed number,
undeterminable `$type`, unresolvable alias, alias cycle, alias type
mismatch, unknown top-level folder, conflicting types across modes.

**Write errors** carry `{ variable, reason, source: { file, path } }`
and are raised during apply. Catalogue: variable exists and
`updateExisting` is off, mode not initialised, alias target not found,
value coercion failed, Figma API threw.

The console echoes at most **12** per-token errors followed by
`…and N more`; the full list is retained for the Step 4 statistics.

---

## 8. Worked example

Input:

```
core/color.json        color/blue/500      color   "#0d99ff"
semantic/light.json    bg/surface          color   "{color.blue.500}"
semantic/dark.json     bg/surface          color   "{color.blue.900}"
```

With defaults (`keepAlias`, `slash`, `updateExisting`):

- `core/` → **Primitives**; one file in its directory → single group →
  mode `Value`.
- `semantic/` → Semantic base; two files, identical shape → themed
  group with modes {Light, Dark} → **Semantic-Color-Scheme** (§4.3.2a),
  default mode `Light`.
- `color/blue/500` → Primitives variable, `COLOR`, mode `Value`.
- `bg/surface` → **one** Semantic-Color-Scheme variable with two mode
  entries, each an alias edge into Primitives.
- `{color.blue.900}` has no matching token → warning
  `alias "{color.blue.900}" → "color/blue/900" does not match any
  token`, and the `Dark` entry is dropped.

Switching `separator` to `dot` renames everything to `color.blue.500` /
`bg.surface`. Switching `refMode` to `resolve` replaces the alias edges
with the literal `#0d99ff`.

---

## 9. Conformance and deviations

The implementation tracks **DTCG · 2025.10**
(<https://www.designtokens.org/tr/drafts/format/>), pinned per
ADR-0005. Deviations are recorded in
[../docs/spec-deviations.md](../docs/spec-deviations.md) with a reason,
and must also surface in the import console as a warning rather than a
silent drop ([constitution.md](constitution.md) §3.2).
