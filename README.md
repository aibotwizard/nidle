# Nidle — W3C Design Tokens → Figma Variables Plugin

A Figma plugin that imports **W3C Design Tokens (DTCG · 2025.10)** from a
folder of JSON files and creates the matching **Figma variables** in your
file — preserving names, groupings, types, **aliases**, and **themes**.

Boppli is a deterministic, auditable bridge from token JSON to Figma. No
editing tokens in Figma, no cloud sync, no telemetry.

---

## Screenshots

| Step 1 — Source | Step 3 — Preview |
|---|---|
| ![Source step: upload a folder of W3C DTCG token files](docs/images/step-1-source.png) | ![Preview step: variables grouped by Primitives, Semantic, and Components collections ready to import](docs/images/step-3-preview.png) |

---

## Features

- **Folder upload** — drop a folder of `.json` files, or use the system
  picker. Nested folders are walked automatically.
- **W3C DTCG · 2025.10 parser** — handles `$type` of `color`,
  `dimension`, and `number`. Unsupported types are surfaced as console
  warnings, never silently dropped.
- **Tokens Studio single-file format** — also accepts a single combined
  JSON exported by Tokens Studio for Figma (detected via
  `$metadata.tokenSetOrder` / `$themes`). Each token set is expanded
  into a virtual file before parsing, so aliases resolve correctly
  without the set-key prefix. *Known issue: COLOR variables currently
  land in Figma as `FFFFFF` from this format; multi-file W3C DTCG
  imports are unaffected. Under investigation — see
  [Known issues](#known-issues).*
- **Four-step guided flow** — Source → Sets → Preview → Import. Step 3
  shows exactly what will be created before any Figma mutation happens.
- **Three-collection layout** — folder convention (case-insensitive)
  drives bucketing. `core/*`, `palette/*` → **Primitives**;
  `semantic/*`, `scheme*/*`, `device/*`, `appearance/*`, `theme/*`,
  `elements/*`, `utilities/*`, `helpers/*` → **Semantic**;
  `components/*` → **Components**. Unknown top-level folders fall back
  to Primitives with a warning; flat single-file uploads stay in
  Primitives silently.
- **Graceful mode-limit handling** — on free Figma plans, collections
  are limited to one mode. If `addMode` is rejected, the plugin logs an
  `err`-toned progress line ("upgrade Figma plan for multi-mode
  support") and continues with the modes that were successfully added,
  rather than crashing.
- **Aliases resolved across files** — `{color.blue.500}` references are
  walked across every uploaded file. The **Reference handling** setting
  toggles between *Keep as alias* (Figma variable-to-variable edges that
  preserve the author's direct hop, e.g. `button → accent.primary`) and
  *Resolve to raw value* (substitute the chain-tip literal). Cycles,
  missing targets, and type mismatches all surface as per-token
  warnings — never silent drops. See
  [ADR-0009](specs/decisions/0009-keepalias-preserves-direct-hop.md) for
  the chain-handling decision.
- **Themes → modes** — sibling files in the same directory whose
  `(name, type)` shapes match are folded into one collection with one
  mode per file. `semantic/light.json` + `semantic/dark.json` become a
  `Semantic` collection with `Light` and `Dark` modes; alias edges are
  written per mode.
- **Group separator** — emit variable names with `/` or `.` between
  groups (Figma renders both as nesting in the Variables panel).
- **Idempotent re-runs** — re-importing the same tokens matches by
  `(collection, name)` and updates values in place rather than creating
  duplicates. The **Update existing variables** toggle inverts this:
  when off, existing variables are preserved and the skip is logged per
  token. See
  [ADR-0004](specs/decisions/0004-idempotent-variable-upsert.md) for
  the rationale.
- **Settings persistence** — every setting above is stored in Figma's
  `clientStorage` and re-loaded on plugin boot.
- **Live progress + console** — Step 4 streams progress and a
  per-operation log carrying `(file, path, reason)` for every error, so
  a failed import tells you exactly which token in which file went
  wrong.
- **Zero network access** — the manifest declares
  `networkAccess: ["none"]`. Nothing leaves Figma. (M3 — GitLab source
  — will broaden this to the user's configured GitLab host only.)

### Planned

The full roadmap is in [specs/constitution.md](specs/constitution.md) §2.
The only outstanding milestone:

- **M3 — GitLab source** — connect to a self-hosted GitLab repo and pull
  tokens from a branch. Credentials persist in `clientStorage`, never
  sent anywhere else.

---

## Install (development)

Boppli ships as source. To run it in Figma desktop:

1. **Clone the repo.**
   ```sh
   git clone https://github.com/aibotwizard/boppli.git
   cd boppli/plugin
   ```
2. **Install dependencies.** Requires Node 18+.
   ```sh
   npm install
   ```
3. **Build the plugin bundle.** Produces `plugin/dist/code.js` and a
   single self-contained `plugin/dist/ui.html`.
   ```sh
   npm run build
   ```
   Or, for iterative development:
   ```sh
   npm run watch
   ```
4. **Load it in Figma desktop.**
   - Open Figma desktop (the web app cannot load dev plugins).
   - Menu → **Plugins → Development → Import plugin from manifest…**
   - Pick [`plugin/manifest.json`](plugin/manifest.json).

The plugin now appears under **Plugins → Development → Tokens → Variables**.

### Verify the build

```sh
cd plugin
npm test         # DTCG parse, alias resolve, planForFiles (64 tests)
npm run typecheck
```

---

## Use

1. **Run the plugin** in any Figma file: **Plugins → Development →
   Tokens → Variables**.
2. **Step 1 — Source.** Click **browse files** (or drag a folder onto the
   drop zone) and select a folder containing your DTCG `.json` files.
   The plugin walks subfolders automatically.
3. **Step 2 — Sets.** Review the detected files, grouped by folder.
   Untick any files you don't want to import. The header explains how
   folder names map to collections and how sibling files become modes.
4. **Step 3 — Preview.** Inspect the variables that will be created,
   grouped by collection. Each collection shows its mode chips; each
   row shows one token per mode with a swatch (for colors), a literal
   value, or an `→ target` reference (for kept-alias values). Counts at
   the top tell you total variables, collections, modes, and source
   files. Parse warnings appear in a panel at the bottom.
5. **Step 4 — Import.** Click **Import N variables**. A progress bar and
   live console show each operation. When the import completes, all
   relevant collections are populated in your Figma file's **Variables**
   panel — Primitives first, then Semantic, then Components, so
   cross-collection alias edges resolve cleanly.

### Settings

Click the **gear icon** in the title bar to open the settings sheet:

- **Reference handling** — *Keep as alias* (default) vs *Resolve to raw
  value*.
- **Group separator** — `/` (default) vs `.`.
- **Update existing variables** — on (default) vs off.
- **Themes detected** — read-only list of every theme group the planner
  folded into modes (collection · directory · `Mode ← file`).

All three settings persist across runs.

### Supported token shape

Boppli supports two input formats:

**W3C DTCG · 2025.10** — a folder of `.json` files, each a plain token
group. `$type` ∈ `{color, dimension, number}`. Aliases
(`"{group.token}"`) are resolved across all uploaded files.

**Tokens Studio for Figma** — a single combined `.json` with
`$metadata.tokenSetOrder` and `$themes` at the root. Each token set is
treated as its own namespace so aliases like `{post.core.color.blue}`
resolve within the set. *Currently affected by a COLOR-import
regression — see [Known issues](#known-issues).*

Example (W3C DTCG):

```json
{
  "color": {
    "blue":  { "500": { "$type": "color", "$value": "#0D99FF" } },
    "gray":  { "900": { "$type": "color", "$value": "#1E1E1E" } }
  },
  "space": {
    "200":   { "$type": "dimension", "$value": 16 }
  },
  "surface": {
    "background": { "$type": "color", "$value": "{color.gray.900}" }
  }
}
```

With *Reference handling* set to **Keep as alias**, `surface.background`
becomes a Figma variable aliased to `color/gray/900`. With **Resolve to
raw value** it becomes a literal `#1E1E1E`.

---

## Project structure

```
boppli/
├── plugin/                  # The shipping plugin
│   ├── manifest.json
│   ├── build.mjs            # esbuild — bundles UI + sandbox + inlines HTML
│   ├── src/
│   │   ├── code/            # Sandboxed Figma side (calls figma.variables.*)
│   │   ├── ui/              # Iframe UI (HTML + CSS + TS)
│   │   └── shared/
│   │       ├── dtcg/        # DTCG parser + alias resolver
│   │       └── mapping/     # tokens → CollectionPlan[] + VariableOp[]
│   └── tests/               # vitest unit tests + DTCG fixtures (m1, m2, m4)
├── specs/                   # Constitution, plan, ADRs, agents
│   ├── constitution.md
│   ├── plan.md
│   ├── decisions/           # ADRs 0001–0009
│   ├── agents/              # AO / UX / PO agent definitions
│   ├── assets/              # Design source (HTML/CSS/JS prototype)
│   └── requirements/        # User-facing requirements (req-0001.md)
└── docs/
    └── images/              # README screenshots
```

---

## Documentation

- **Mission, roadmap, validation gates** —
  [specs/constitution.md](specs/constitution.md)
- **Implementation plan** — [specs/plan.md](specs/plan.md)
- **Architecture decisions** —
  [specs/decisions/](specs/decisions/) (9 ADRs, indexed in
  [decisions/README.md](specs/decisions/README.md))
- **Team agents** — [specs/agents/](specs/agents/) (AO, UX, PO)
- **Original requirement** —
  [specs/requirements/req-0001.md](specs/requirements/req-0001.md)
- **Design source of truth** —
  [`specs/assets/figma-design-tokens-plugin/project/Tokens to Variables.dc.html`](specs/assets/figma-design-tokens-plugin/project/Tokens%20to%20Variables.dc.html)

---

## Known issues

- **Tokens Studio single-file imports — COLOR variables come in as
  `FFFFFF`.** Verified on a Post-brand Tokens Studio export (~168
  primitives). The plugin's Step 3 preview renders the swatches
  correctly, all 168 variables are created in Figma with the right
  names and groupings, and no per-token errors are reported, but every
  COLOR variable shows `FFFFFF` in the Variables panel. The same code
  path against a multi-file **W3C DTCG** upload writes colors
  correctly, so the regression is specific to the Tokens Studio
  single-file branch. Root cause not yet identified. Investigated and
  ruled out so far: (a) hex-parsing produces the right `{r,g,b,a}`
  floats; (b) cached live `Variable` handles are used for writes (no
  id-based round-trip through deprecated sync getters); (c) writes
  target the collection's `defaultModeId`, not just `modes[0]`; (d) no
  silent rejection — the first 8 writes per run are readback-verified.

---

## License

Not yet specified.
