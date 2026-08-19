# Feature Requirements

Itemised, testable requirements derived from
[req-0001.md](req-0001.md) (user intent), scoped by
[../constitution.md](../constitution.md) §1–§2, and specified in
detail by [../specification.md](../specification.md).

`req-0001.md` stays the short statement of user intent and does not
accumulate detail ([../agents/po.md](../agents/po.md)). This file is
where that intent becomes checkable.

## How to read this

- **ID** — stable. Never renumber; retire with status `withdrawn`.
- **Status** — `implemented` · `planned` · `partial` · `proposed`.
  `proposed` means not yet ratified by the PO into
  [../constitution.md](../constitution.md) §2.
- **M** — milestone, per [../roadmap.md](../roadmap.md).
- **Verified by** — the artifact that proves it. `—` means **the
  requirement is not currently pinned by any test**, which is itself a
  finding.

Test paths are relative to `plugin/`.

---

## FR-1xx · Source and intake

| ID | Requirement | Status | M | Verified by |
|----|-------------|--------|---|-------------|
| FR-101 | The user can select a folder of token files with the system file picker. | implemented | M1 | `tests/ui/appFlow.spec.tsx` |
| FR-102 | The user can drag and drop a folder onto the plugin window; nested directories are traversed. | implemented | M1 | `tests/ui/intake.spec.ts` |
| FR-103 | Only `.json` files are read; other files are ignored without error. | implemented | M1 | `tests/ui/intake.spec.ts` |
| FR-104 | A file that fails `JSON.parse` is reported per-file and does not abort the remaining files. | implemented | M1 | `tests/ui/intake.spec.ts` |
| FR-105 | Each file retains its path relative to the upload root, and that path drives collection routing and theme grouping. | implemented | M1 | `tests/toFigma.spec.ts` |
| FR-106 | Dropping a folder and picking the same folder produce identical results. | implemented | M1 | `tests/ui/intake.spec.ts` |
| FR-107 | Uploaded files are held in memory only and never written to disk. | implemented | M1 | review gate, constitution §3.4 |
| FR-108 | The user can connect to a locally hosted GitLab instance with an instance URL, PAT, project path, branch, and subfolder. | planned | M3 | — |
| FR-109 | GitLab credentials persist in `clientStorage` and are transmitted to no other host. | planned | M3 | — |
| FR-110 | GitLab file listing uses REST v4; fetched contents parse identically to uploaded files. | planned | M3 | — |

> **FR-106 closed (2026-08-19, ADR-0013).** `src/ui/io/intake.ts` now
> owns the path contract — producers normalize, nothing downstream
> strips — and `tests/ui/intake.spec.ts` pins drop ≡ pick, including
> dropping the collection folder itself.

---

## FR-2xx · Parsing (DTCG)

| ID | Requirement | Status | M | Verified by |
|----|-------------|--------|---|-------------|
| FR-201 | A node with both `$type` and `$value` is a token; other objects are groups and are recursed. | implemented | M1 | `tests/parse.spec.ts` |
| FR-202 | Keys beginning with `$` are treated as metadata and never walked as groups. | implemented | M1 | `tests/parse.spec.ts` |
| FR-203 | A token's name is the slash-joined key trail from the file root; the file name does not contribute. | implemented | M1 | `tests/parse.spec.ts` |
| FR-204 | `$type` values `color`, `dimension`, and `number` are supported. | implemented | M1 | `tests/parse.spec.ts` |
| FR-205 | Any other `$type` produces a warning naming the type and skips the token. | implemented | M1 | `tests/parse.spec.ts` |
| FR-206 | A file whose root is not a JSON object is skipped with a warning. | implemented | M1 | — |
| FR-207 | `color` values must be strings or aliases; non-strings warn. | implemented | M1 | `tests/parse.spec.ts` |
| FR-208 | `dimension` values are coerced to px: numbers and bare numerics pass through, `px` drops the unit, `rem`/`em` multiply by 16. | implemented | M1 | `tests/parse.spec.ts` (ADR-0011) |
| FR-209 | Any other dimension unit warns and drops the token. | implemented | M1 | `tests/parse.spec.ts` |
| FR-210 | `number` values accept JSON numbers and strictly numeric strings; trailing garbage warns and drops. | implemented | M1 | `tests/parse.spec.ts` (D-6) |
| FR-211 | Alias strings `{a.b.c}` are preserved verbatim by the parser for any `$type`. | implemented | M2 | `tests/parse.spec.ts` |
| FR-212 | Parsing produces a flat token list, not a tree. | implemented | M1 | `tests/parse.spec.ts` |
| FR-213 | Composite types (`shadow`, `typography`, `gradient`, …) are handled beyond the current skip-with-warning. | proposed | — | — |

> FR-210 closed 2026-08-19 (req-0003): the numeric-string grammar is
> now strict (`"12abc"` warns and drops) and directly tested.

---

## FR-3xx · Alias resolution

| ID | Requirement | Status | M | Verified by |
|----|-------------|--------|---|-------------|
| FR-301 | Aliases resolve across the union of all uploaded files, not just within one file. | implemented | M2 | `tests/resolve.spec.ts` |
| FR-302 | Alias paths are dot-separated in source and converted to the internal slash form. | implemented | M2 | `tests/resolve.spec.ts` |
| FR-303 | Alias chains are walked transitively to validate termination. | implemented | M2 | `tests/resolve.spec.ts` |
| FR-304 | Alias cycles are detected, warned with the full trail, and the token is dropped. | implemented | M2 | `tests/resolve.spec.ts` |
| FR-305 | A missing alias target warns and drops the token. | implemented | M2 | `tests/resolve.spec.ts` |
| FR-306 | A chain-tip `$type` that differs from the source token's `$type` warns and drops the token. | implemented | M2 | `tests/resolve.spec.ts` |
| FR-307 | Under `keepAlias`, the resolved target is the author's **direct hop**, not the chain tip. | implemented | M2 | `tests/resolve.spec.ts` (ADR-0009) |
| FR-308 | Under `resolve`, the alias is replaced by the chain tip's literal value. | implemented | M2 | `tests/resolve.spec.ts` |

---

## FR-4xx · Planning and mapping

| ID | Requirement | Status | M | Verified by |
|----|-------------|--------|---|-------------|
| FR-401 | The full plan is computed before any Figma mutation and is the same value the Step 3 preview renders. | implemented | M1 | `tests/toFigma.spec.ts` (ADR-0001) |
| FR-402 | The first path segment routes a file to Primitives, Semantic, or Components per the documented table. | implemented | M4 | `tests/toFigma.spec.ts` |
| FR-403 | An unknown top-level folder falls back to Primitives with a warning. | implemented | M4 | `tests/toFigma.spec.ts` |
| FR-404 | A flat upload with no folder routes to Primitives silently. | implemented | M1 | `tests/toFigma.spec.ts` |
| FR-405 | Collections are emitted in the order Primitives → Semantic → Components; empty collections are omitted. | implemented | M4 | `tests/toFigma.spec.ts` |
| FR-406 | Sibling files in one directory with identical `(name, type)` shape become modes of one collection. | implemented | M2 | `tests/toFigma.spec.ts` |
| FR-407 | Mode names come from the file basename, `.json` stripped, first letter capitalised. | implemented | M2 | `tests/toFigma.spec.ts` |
| FR-408 | A directory that is not a theme group contributes the single mode `Value`. | implemented | M2 | `tests/toFigma.spec.ts` |
| FR-409 | A mode named `default` is reordered to first, becoming the collection's default mode. | implemented | M2 | **—** |
| FR-410 | Variable names use the configured separator, applied at plan time so names and alias targets stay consistent. | implemented | M4 | `tests/toFigma.spec.ts` |
| FR-411 | The same name across modes yields one variable with one entry per mode. | implemented | M2 | `tests/toFigma.spec.ts` |
| FR-412 | Conflicting resolved types across modes warn and skip the conflicting entry. | implemented | M2 | **—** |
| FR-413 | An alias's target collection is derived from the first file defining the target name. | implemented | M4 | `tests/toFigma.spec.ts` |
| FR-414 | The plan exposes theme groups for the settings sheet's read-only mapping display. | implemented | M2 | **—** |
| FR-415 | A themed semantic group with modes {Light, Dark} becomes collection `Semantic-Color-Scheme`, Light first (= default). | implemented | req-0006 | `tests/toFigma.spec.ts`, `tests/variableWriter.spec.ts` |
| FR-416 | A themed semantic group with modes {Desktop, Tablet} becomes `Semantic-Appearance`, Desktop first. | implemented | req-0006 | `tests/toFigma.spec.ts` |
| FR-417 | Any other themed semantic group splits dynamically into `Semantic-<Dir>`; non-themed semantic files stay in `Semantic`. | implemented | req-0006 | `tests/toFigma.spec.ts` |
| FR-418 | Alias targets name the final (split) collection, not the semantic base. | implemented | req-0006 | `tests/toFigma.spec.ts` |
| FR-419 | Both `components/` and `component/` route to the Components collection. | implemented | req-0006 | `tests/toFigma.spec.ts` |

---

## FR-5xx · Applying to Figma

| ID | Requirement | Status | M | Verified by |
|----|-------------|--------|---|-------------|
| FR-501 | Only the apply stage calls `figma.variables.*`. | implemented | M1 | review gate (ADR-0001) |
| FR-502 | An existing collection with the same name is reused rather than duplicated. | implemented | M1 | `tests/variableWriter.spec.ts` |
| FR-503 | The plan's first mode is bound to the collection's `defaultModeId`, not its `modes[0]`. | implemented | M2 | **—** |
| FR-504 | Exceeding Figma's mode limit skips the remaining modes, tells the user, and suppresses the resulting value errors. | implemented | M2 | **—** |
| FR-505 | Existing variables are matched by `(collection, name)` in a single scan. | implemented | M4 | `tests/variableWriter.spec.ts` (ADR-0004) |
| FR-506 | With `updateExisting` on, an existing variable is overwritten in place. | implemented | M4 | `tests/variableWriter.spec.ts` |
| FR-507 | With `updateExisting` off, an existing variable is left alone and a per-token skip is recorded. | implemented | M4 | `tests/variableWriter.spec.ts` |
| FR-508 | Every variable is materialised before any value is written, so alias edges can bind. | implemented | M2 | `tests/variableWriter.spec.ts` |
| FR-509 | Aliases are written as Figma variable-to-variable alias edges. | implemented | M2 | `tests/variableWriter.spec.ts` |
| FR-510 | Colour literals are coerced to `{r,g,b,a}` 0–1 floats from hex or `rgb()`/`rgba()`. | implemented | M1 | `tests/parse.spec.ts` |
| FR-511 | A coercion failure or missing alias target records a per-token error and continues. | implemented | M1 | **—** |
| FR-512 | An exception from the Figma API is caught per token and never aborts the import. | implemented | M1 | **—** |
| FR-513 | Re-running the same import updates variables rather than duplicating them. | implemented | M4 | `tests/variableWriter.spec.ts` (ADR-0004) |
| FR-514 | Changing the separator between runs does not orphan and duplicate previously written variables. | **not met** | — | — |

> **FR-503, FR-504, FR-511, FR-512 are unverifiable through the current
> test suite.** All writer tests run against the in-memory adapter,
> which hardcodes `defaultModeId` to `modes[0]`, never throws on the
> mode limit, never rejects a type mismatch, and never rejects a
> duplicate name — precisely the four failure modes these requirements
> cover. See [../architecture.md](../architecture.md) §7.3.
>
> **FR-514 is a known open defect** acknowledged in ADR-0004's negative
> consequences and never closed.

---

## FR-6xx · Settings

| ID | Requirement | Status | M | Verified by |
|----|-------------|--------|---|-------------|
| FR-601 | Reference handling toggles between `keepAlias` and `resolve`. | implemented | M2 | `tests/ui/appFlow.spec.tsx` |
| FR-602 | Group separator toggles between `slash` and `dot`. | implemented | M4 | `tests/ui/appFlow.spec.tsx` |
| FR-603 | Update-existing toggles on and off. | implemented | M4 | `tests/ui/appFlow.spec.tsx` |
| FR-604 | Settings persist across plugin runs in `figma.clientStorage`. | implemented | M2 | `tests/settingsIO.spec.ts` (both adapters) |
| FR-610 | Settings are stored under `nidle.settings.v1`; a legacy `boppli.settings.v1` value is migrated on first read. | implemented | req-0006 | **—** (sandbox side, see req-0004) |
| FR-605 | Missing keys are filled from defaults on read, so schema additions do not break existing installs. | implemented | M2 | `tests/settingsIO.spec.ts` |
| FR-606 | Corrupt or out-of-enum stored values fall back to their default rather than propagating. | implemented | M2 | `tests/settingsIO.spec.ts` |
| FR-607 | Changing a setting recomputes the plan so the preview matches what will be written. | implemented | M2 | `tests/ui/appFlow.spec.tsx` |
| FR-608 | The settings sheet shows a read-only theme → mode mapping. | implemented | M2 | **—** |
| FR-609 | The theme → mode mapping is editable when the heuristic misfires. | proposed | — | — |

> FR-604's real `postMessage` adapter is now tested directly
> (`tests/settingsIO.spec.ts`), including the silent-sandbox case: since
> ADR-0013 the load times out to defaults after 2s instead of hanging.

---

## FR-7xx · Wizard UI

| ID | Requirement | Status | M | Verified by |
|----|-------------|--------|---|-------------|
| FR-701 | The UI is a four-step wizard: Source → Sets → Preview → Import. | implemented | M1 | `tests/ui/appFlow.spec.tsx` |
| FR-702 | The UI matches the design asset pixel-for-pixel across four steps and the settings sheet. | implemented | M1 | UX gate, constitution §3.3 |
| FR-703 | Step 2 lists detected files and lets the user include or exclude each one. | implemented | M1 | `tests/ui/appFlow.spec.tsx` |
| FR-704 | Step 3 previews collections, modes, and variables from the same plan that will be applied. | implemented | M1 | `tests/ui/appFlow.spec.tsx` |
| FR-705 | The primary button is disabled when the plan contains no variables. | implemented | M1 | **—** |
| FR-706 | Step 4 streams live progress and a console log during import. | implemented | M1/M5 | `tests/ui/appFlow.spec.tsx` |
| FR-707 | The progress bar advances incrementally rather than jumping 0 → 100. | implemented | M5 | `tests/variableWriter.spec.ts` (ADR-0010) |
| FR-708 | Step 4 reports created, updated, error, and warning counts on completion. | implemented | M5 | **—** |
| FR-709 | At most 12 per-token errors are echoed, followed by `…and N more`. | implemented | M5 | `tests/ui/appState.spec.ts` |
| FR-710 | A sandbox error is surfaced to the user. | implemented | M1 | `tests/ui/appFlow.spec.tsx` |
| FR-711 | Text input focus and selection survive re-render. | implemented | — | — (ADR-0012) |
| FR-712 | The source picker shows only Upload until GitLab ships. | implemented | M1 | UX gate (ADR-0006) |

> FR-710's error path gained its first test in the 2026-08-19 UI
> rewrite (`appFlow.spec.tsx > "surfaces a sandbox error on step 4"`).

---

## FR-8xx · Diagnostics

| ID | Requirement | Status | M | Verified by |
|----|-------------|--------|---|-------------|
| FR-801 | Every skipped token surfaces as a console warning; nothing is dropped silently. | implemented | M1 | constitution §3.2 |
| FR-802 | Plan warnings carry `{ file, path, reason }`. | implemented | M1 | `tests/parse.spec.ts` |
| FR-803 | Write errors carry `{ variable, reason, source: { file, path } }`. | implemented | M5 | `tests/variableWriter.spec.ts` |
| FR-804 | Console lines are toned (`plain`, `dim`, `ok`, `err`). | implemented | M1 | `tests/ui/appState.spec.ts` |
| FR-805 | Progress reporting is monotonic and phase-budgeted across setup and write. | implemented | req-0003 | `tests/variableWriter.spec.ts` (progress budget) |

> FR-805 closed 2026-08-19 (req-0003): `variableWriter` is the single
> owner of the progress scale — callees report local phase fractions,
> the writer maps them onto one monotonic 0–100 (setup 0–10, writes
> 10–100), pinned by a nondecreasing-percentages test.

---

## FR-9xx · Security and privacy

| ID | Requirement | Status | M | Verified by |
|----|-------------|--------|---|-------------|
| FR-901 | No credential or setting is persisted anywhere but Figma `clientStorage`. | implemented | M1 | grep gate, constitution §3.4 |
| FR-902 | The MVP manifest declares `networkAccess: ["none"]`. | implemented | M1 | manifest review (ADR-0008) |
| FR-903 | The shipped UI is a single inlined HTML file with no external `<link>` or `<script src>`. | implemented | M1 | build review (ADR-0003) |
| FR-904 | No telemetry, analytics, or crash reporting of any kind. | implemented | M1 | constitution §1 |
| FR-905 | At M3, network access is narrowed to the configured GitLab host only. | planned | M3 | — |
| FR-906 | Settings read from `clientStorage` are validated before use on **both** sides of the postMessage boundary. | implemented | req-0002 | `tests/settingsIO.spec.ts` (shared validator; sandbox runtime untested, see req-0004) |

> FR-906 closed 2026-08-19 (req-0002): `mergeWithDefaults` moved to
> `shared/mapping/toFigma.ts` and the sandbox's `readSettings` now runs
> the same whitelist before posting.

---

## Summary of gaps

Requirements that are stated but **not currently met**:

| Gap | Specified by |
|-----|--------------|
| **FR-514** — separator change orphans and duplicates variables (the one remaining gap) | [req-0002](req-0002-deterministic-import.md) |

Requirements that are met but **not pinned by any test** — 17 rows
marked `—`, in three clusters:

| Cluster | Specified by |
|---------|--------------|
| Write-failure paths — FR-503, FR-504, FR-511, FR-512 | [req-0004](req-0004-verifiable-apply-stage.md) |
| Write-failure paths only — the UI clusters (FR-102/104/604, FR-710) were closed by the 2026-08-19 rewrite (ADR-0013) | |

Open scope question, not a defect: Tokens Studio support ships but is a
declared non-goal — [req-0005](req-0005-tokens-studio-scope.md) asks the
PO for a ruling.

[../roadmap.md](../roadmap.md) sequences the work that closes these.
