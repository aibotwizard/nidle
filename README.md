# Boppli — Tokens → Variables

A Figma plugin that imports **W3C Design Tokens (DTCG · 2025.10)** from a
folder of JSON files and creates the matching **Figma variables** in your
file — preserving names, groupings, and types.

The MVP focuses on a deterministic, auditable path from token JSON to
Figma. No editing tokens in Figma, no cloud sync, no telemetry.

---

## Screenshots

| Step 1 — Source | Step 3 — Preview |
|---|---|
| ![Source step: upload a folder of W3C DTCG token files](docs/images/step-1-source.png) | ![Preview step: 1,603 variables across 1 collection ready to import](docs/images/step-3-preview.png) |

---

## Features

- **Folder upload** — drop a folder of `.json` files, or use the system
  picker. Nested folders are walked automatically.
- **W3C DTCG · 2025.10 parser** — handles `$type` of `color`,
  `dimension`, and `number`. Unsupported types are surfaced as console
  warnings, never silently dropped.
- **Four-step guided flow** — Source → Sets → Preview → Import. Step 3
  shows exactly what will be created before any Figma mutation happens.
- **Idempotent re-runs** — re-importing the same tokens updates the
  existing variables in place rather than creating duplicates.
- **Single Primitives collection (MVP)** — every token lands in a
  collection named `Primitives` with one mode named `Value`. Color
  tokens become `COLOR` variables; dimensions and numbers become
  `FLOAT` variables.
- **Live progress + console** — Step 4 streams progress and a
  per-operation log, so a failed import tells you which token in which
  file went wrong.
- **Zero network access** — the MVP manifest declares
  `networkAccess: ["none"]`. Nothing leaves Figma.

### Not in the MVP (planned)

The full roadmap is in [specs/constitution.md](specs/constitution.md) §2.
Each item there is tagged **[implemented]** or **[planned]**. Notable
**[planned]** items:

- GitLab source — connect to a self-hosted GitLab repo and pull tokens
  from a branch.
- Settings sheet — reference handling (alias vs resolved), group
  separator (`/` vs `.`), update-existing toggle, theme→mode mapping.
- Aliases and multi-theme support — resolve `{color.blue.500}`
  references and surface `light.json` / `dark.json` as **modes** in a
  Semantic collection.
- Three-collection layout — `core/` → Primitives, `semantic/` →
  Semantic, `components/` → Components.

---

## Install (development)

The MVP is published as source. To run it in Figma desktop:

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
npm test         # parser + mapping unit tests (vitest)
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
   Untick any files you don't want to import.
4. **Step 3 — Preview.** Inspect the variables that will be created.
   You'll see one row per token with its resolved value and a color
   swatch where applicable. Counts at the top tell you total variables,
   collections, modes, and source files.
5. **Step 4 — Import.** Click **Import N variables**. A progress bar
   and live console show each operation. When the import completes,
   the **Primitives** collection (or whichever exists) is populated in
   your Figma file's **Variables** panel.

### Re-importing

Re-running the plugin with the same token files updates existing
variables in place (matched by `(collection, name)`) — it does not
create duplicates. See [ADR-0004](specs/decisions/0004-idempotent-variable-upsert.md)
for the rationale.

### Supported token shape

The MVP supports W3C DTCG · 2025.10 with `$type` ∈ `{color, dimension,
number}`. Example:

```json
{
  "color": {
    "blue": {
      "500": { "$type": "color", "$value": "#0D99FF" }
    }
  },
  "space": {
    "200": { "$type": "dimension", "$value": 16 }
  }
}
```

Aliases (`{color.blue.500}`) are not resolved in the MVP — they're a
**[planned]** item for the next milestone.

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
│   │   └── shared/          # DTCG parser + mapping → variable plan
│   └── tests/               # vitest unit tests + DTCG fixtures
├── specs/                   # Constitution, plan, ADRs, agents
│   ├── constitution.md
│   ├── plan.md
│   ├── decisions/           # ADRs 0001–0008
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
  [specs/decisions/](specs/decisions/) (8 ADRs, indexed in the README)
- **Team agents** — [specs/agents/](specs/agents/) (AO, UX, PO)
- **Original requirement** —
  [specs/requirements/req-0001.md](specs/requirements/req-0001.md)
- **Design source of truth** —
  [`specs/assets/figma-design-tokens-plugin/project/Tokens to Variables.dc.html`](specs/assets/figma-design-tokens-plugin/project/Tokens%20to%20Variables.dc.html)

---

## License

Not yet specified.
