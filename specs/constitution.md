# Constitution — Tokens → Variables (Figma Plugin)

The constitution is the durable agreement that frames every decision in this
project. It is short on purpose. If a decision is not derivable from this
document plus the linked requirements, it belongs in a follow-up amendment,
not in scattered code or chat.

Source of truth for the product surface: [requirements/req-0001.md](requirements/req-0001.md).
Source of truth for the visual & interaction design: [assets/figma-design-tokens-plugin/project/Tokens to Variables.dc.html](assets/figma-design-tokens-plugin/project/Tokens%20to%20Variables.dc.html).

---

## 1. Mission

Give design-system teams a **deterministic, auditable path** from W3C DTCG
token files (DTCG · 2025.10) to Figma Variables — without leaving Figma and
without losing the semantic intent (groups, aliases, themes → modes) encoded
in the source files.

The plugin is a **bridge**, not a token editor. It reads from a single source
of truth (a locally hosted GitLab repository, or a user-uploaded folder) and
writes Figma variables that are 1:1 traceable back to that source.

### Non-goals

- Editing tokens inside Figma. The repo is canonical; round-trip authoring
  is out of scope.
- Cloud sync, hosted backends, telemetry. All credentials and state stay in
  Figma's `clientStorage` on the user's machine.
- Translating to formats other than Figma Variables (no Style Dictionary
  output, no CSS export).
- Supporting token formats other than W3C DTCG 2025.10. Older Tokens Studio
  format files are out of scope.

---

## 2. Roadmap

Sequenced milestones. Each milestone is shippable on its own; later
milestones extend earlier ones, they do not rework them.

Status legend: **[implemented]** shipped in the current MVP ·
**[planned]** designed, not yet built.

### M1 — Walking skeleton (Upload + Primitives) — **[implemented]**

- **[implemented]** 4-step UI shell matching the design (Source → Sets →
  Preview → Import).
- **[implemented]** "Upload folder" source; user picks a folder of
  `.json` files via the system picker.
- **[implemented]** Parse DTCG `$type` + `$value` for `color`,
  `dimension`, `number`.
- **[implemented]** Emit one Figma collection ("Primitives") with a
  single mode, no aliases.
- **[implemented]** Settings sheet — shipped in M2.
- **[planned]** GitLab source tab — not part of the MVP. The source
  picker shows Upload only until M3.

**Done when:** a user can upload `core/color.json`, click through 4 steps,
and see Figma variables created in the Primitives collection.

### M2 — Aliases & themes — **[implemented]**

- **[implemented]** Resolve `{group.token}` references within the upload.
- **[implemented]** Reference handling toggle (`alias` ↔ `resolve`) wired to
  settings, persisted in `clientStorage`.
- **[implemented]** Detect multi-file themes (e.g. `light.json` /
  `dark.json`) and surface them as **modes** inside a Semantic
  collection. Sibling files with matching (path, type) shape become modes.
- **[implemented]** Theme → mode mapping UI in the settings sheet (read-only
  surfacing of detected themes).

**Done when:** Semantic collection with Light + Dark modes is created, and
toggling reference handling visibly changes the preview and the output.

### M3 — GitLab source — **[planned]**

- **[planned]** "GitLab" source tab: instance URL, PAT (scope
  `read_repository`), project path, branch, subfolder.
- **[planned]** Credentials persisted in `clientStorage`, never sent
  anywhere else.
- **[planned]** File listing via GitLab REST v4; fetched contents parsed
  as in M1/M2.

**Done when:** a user with a PAT can connect to a locally hosted GitLab,
pick a subfolder, and reach Step 2 with the file tree populated.

### M4 — Multi-collection layout & update semantics — **[implemented]**

- **[implemented]** Three-collection layout: **Primitives**, **Semantic**,
  **Components**, driven by folder convention (`core/`, `semantic/`,
  `components/`). Unknown top-level folders fall back to Primitives with a
  warning.
- **[implemented]** Group separator setting (`slash` ↔ `dot`) applied to
  variable names, persisted in `clientStorage`.
- **[implemented]** "Update existing variables" toggle — match by
  `(collection, name)`, overwrite values in place rather than duplicating.
  When off, an existing variable is left alone and the operation is logged
  as a per-token skip.

**Done when:** re-running an import against an existing file updates
variables instead of creating new ones.

### M5 — Polish & resilience — **[implemented]**

Most M5 items shipped incidentally during M1/M2 because the underlying
mechanics (live progress messages, plan-op provenance) were already in
the architecture. M5's status is recorded here for completeness.

- **[implemented]** Streaming progress + console log during import
  (shipped in M1; the sandbox posts `{type:'progress', pct, line, tone}`
  per batch and the UI streams them into the console column on Step 4).
- **[implemented]** Per-token error reporting (shipped in M1; every
  `PlanError` carries `{ variable, reason, source: { file, path } }`).
- **[implemented]** Settings persisted across runs (shipped in M2 via
  the `readSettings`/`writeSettings` message pair against
  `figma.clientStorage`).

---

## 3. Validation

How we know each milestone is real. Validation is a release gate, not a
post-hoc activity.

### 3.1 Functional validation (per milestone)

Each milestone has a fixture folder under `tests/fixtures/` containing a
real DTCG token set. The plugin must, against that fixture:

- produce the expected collection / mode / variable counts;
- preserve names exactly (modulo the configured separator);
- preserve alias semantics when "Keep as alias" is selected;
- produce literal values when "Resolve to raw value" is selected.

Counts and expected names live next to the fixture as `expected.json` so a
failing diff is unambiguous.

### 3.2 Spec conformance

The implementation tracks **DTCG · 2025.10**
(<https://www.designtokens.org/tr/drafts/format/>). Any deviation — for
example, unsupported `$type` values — must be:

1. listed in `docs/spec-deviations.md` with a one-line reason;
2. surfaced in the import console as a skipped-token warning, not a silent
   drop.

### 3.3 Visual conformance

The plugin UI must match
[assets/figma-design-tokens-plugin/project/Tokens to Variables.dc.html](assets/figma-design-tokens-plugin/project/Tokens%20to%20Variables.dc.html)
pixel-for-pixel for the four steps and the settings sheet. Recreate the
visual output in the target tech (Figma plugin UI = HTML/CSS in an
iframe); do **not** copy the prototype's internal scaffolding.

The UX agent owns this gate.

### 3.4 Security & privacy validation

- GitLab PAT and instance URL are written only to Figma `clientStorage`.
  Grep the codebase for any other persistence path before each release.
- No outbound network calls beyond the configured GitLab instance and
  Figma's own APIs. Verified by reviewing the network manifest in
  `manifest.json` (`networkAccess.allowedDomains`).
- Uploaded folders are read into memory only — never written to disk by
  the plugin.

### 3.5 Definition of Done (every change)

A change ships when **all** of the following hold:

1. The relevant milestone's fixture tests pass.
2. UI changes have been visually diffed against the design asset by the UX
   agent.
3. The PO has signed off that the change advances the current milestone and
   does not introduce non-goal scope.
4. No new entries in `docs/spec-deviations.md` without an accompanying
   reason.

---

## 4. Amendments

This constitution changes only by explicit edit to this file, reviewed by
the PO agent. Tactical decisions (library choices, file layout, naming)
live in [plan.md](plan.md) and may evolve without a constitutional
amendment.
