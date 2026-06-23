# Implementation Plan — req-0001

Implements [requirements/req-0001.md](requirements/req-0001.md) under the
gates set by [constitution.md](constitution.md). This document covers the
**how**; the constitution covers the **why**.

Status legend: **[implemented]** shipped in the current MVP ·
**[planned]** designed, not yet built. See
[constitution.md](constitution.md) §2 for milestone definitions.

## 0. MVP scope (what ships today)

The MVP is the M1 walking skeleton, scoped to **upload-only**:

- **[implemented]** Folder upload via the system file picker.
- **[implemented]** DTCG parse for `color` / `dimension` / `number`.
- **[implemented]** Single-collection "Primitives" output with one mode.
- **[implemented]** 4-step UI matching the design asset (Source → Sets →
  Preview → Import), with hover/disabled states and progress animation.
- **[planned]** GitLab tab: the source segmented control shows Upload
  only; GitLab is not rendered until M3.
- **[planned]** Settings sheet: the settings button is hidden until M2.

## 1. Target technology

- **Figma plugin** — Manifest v3, `editorType: ["figma"]`, runs in Figma
  Design only.
- **UI layer** — single-page plugin iframe rendered as static HTML + a
  small TypeScript bundle. The mocked design is HTML/CSS/JS, so the
  closest 1:1 target is the same medium. No React unless a later
  milestone forces it.
- **Plugin (sandboxed) code** — TypeScript, talks to the UI over
  `postMessage`. All Figma Variables API calls live here.
- **Bundler** — `esbuild`. Two entry points (`ui.ts`, `code.ts`) → two
  bundles. No framework.
- **Tests** — `vitest` for parser/resolver logic; visual conformance is
  enforced manually by the UX agent (see constitution §3.3).

## 2. Repository layout (proposed)

```text
plugin/
  manifest.json
  src/
    code/           # sandbox side
      index.ts
      figmaVariables.ts   # wrapper around figma.variables.*
      messages.ts         # typed UI ↔ code messages
    ui/             # iframe side
      index.html          # mirrors the design asset, no DC runtime
      index.ts
      steps/
        source.ts
        sets.ts
        preview.ts
        import.ts
      settings.ts
    shared/
      dtcg/
        parse.ts          # DTCG file → in-memory token tree
        resolve.ts        # alias resolution
        types.ts          # DTCG $type union, value shapes
      gitlab/
        client.ts         # REST v4 — list tree, fetch blob
      mapping/
        toFigma.ts        # tokens → collection/mode/variable plan
    types.ts
  tests/
    fixtures/
      m1-primitives/
      m2-aliases-themes/
      m4-multi-collection/
    parse.spec.ts
    resolve.spec.ts
    toFigma.spec.ts
specs/                # this directory (constitution, plan, agents, assets)
```

`plugin/` is intentionally separate from `specs/` so the spec bundle can
be edited without touching shipping code, and vice versa.

## 3. Data flow

```text
[Source]                [Parse]               [Plan]              [Apply]
GitLab REST  ─┐                                                            
              ├─►  raw {path, json}  ─► tokenTree  ─► variablePlan  ─► figma.variables.*
Upload (FS)  ─┘                                                            
```

- **tokenTree**: nested map keyed by group, leaves are `{ $type, $value }`
  + provenance (`file`, `path-within-file`).
- **variablePlan**: flat list of operations — `createCollection`,
  `addMode`, `createVariable`, `setValueForMode`, `setAlias`,
  `updateVariable`. The plan is computed entirely UI-side, sent to
  `code/` as one message, and applied transactionally.

Computing the full plan before any Figma mutation gives us (a) an
accurate Step 3 preview and (b) an easy dry-run path for tests.

## 4. Milestone → work breakdown

### M1 — Walking skeleton (Upload + Primitives)

1. Scaffold `manifest.json`, two-entry esbuild config, `pnpm` scripts.
2. Build the static UI shell matching the design asset — header,
   stepper, footer, scroll container, settings sheet (inert). Extract
   the CSS verbatim from the asset; rename `sc-for` / `sc-if` patterns
   into vanilla DOM rendering driven by a small state object.
3. Implement folder upload (HTML `<input type="file" webkitdirectory>`).
4. `shared/dtcg/parse.ts`: walk JSON, collect leaves with `$type` ∈
   `{color, dimension, number}`, error on anything else (logged, not
   thrown).
5. `mapping/toFigma.ts`: emit a single "Primitives" collection, one
   mode, one variable per leaf.
6. `code/figmaVariables.ts`: apply the plan via
   `figma.variables.createVariableCollection` /
   `createVariable` / `setValueForMode`.
7. Fixture `m1-primitives/`, expected counts in `expected.json`,
   `vitest` covering parse + mapping.

### M2 — Aliases & themes

1. `shared/dtcg/resolve.ts`: depth-first alias resolution with cycle
   detection. Two output modes: `keepAlias` (returns
   `{ kind: 'alias', path }`) and `resolve` (returns the literal).
2. Wire the reference-handling toggle in the settings sheet to the plan
   computation.
3. Theme detection: any sibling files whose top-level structure is
   identical except for leaf values become **modes** of one Semantic
   collection. Heuristic owned by `mapping/toFigma.ts`.
4. Settings sheet: render theme → mode mapping list (read-only in M2,
   editable in M4).
5. Fixture `m2-aliases-themes/` covering Light/Dark + cross-collection
   aliases.

### M3 — GitLab source

1. `shared/gitlab/client.ts`: `listTree(projectPath, branch, subfolder)`
   + `getBlob(projectPath, sha)`. Uses `fetch` with the PAT in
   `PRIVATE-TOKEN` header.
2. UI: GitLab tab forms (instance URL, PAT, project path, branch,
   subfolder) — fields already designed in the asset.
3. Credential persistence: on "Connect", write to `clientStorage` via
   the sandboxed code side (UI cannot access it directly). Read on
   plugin boot to pre-fill.
4. Manifest `networkAccess.allowedDomains`: configurable per install;
   default to `["*"]` only in dev, real installs ship with the user's
   GitLab host.
5. No new fixture — same M2 token set, served via a mocked GitLab
   client in tests.

### M4 — Multi-collection layout & update semantics

1. Folder convention in `mapping/toFigma.ts`:
   `core/*` → Primitives, `semantic/*` → Semantic,
   `components/*` → Components. Unknown folders → Primitives + warning.
2. Group separator setting threads through to variable-name emission.
3. "Update existing variables": before `createVariable`, look up by
   `(collection, name)`; if present, emit `updateVariable` instead.
4. Fixture `m4-multi-collection/` matching the three-collection
   structure shown in the design.

### M5 — Polish & resilience

1. Streaming progress: `code/` posts `{type: 'progress', pct, line}`
   between batches; UI animates the bar + appends to the console.
2. Per-token errors: every plan operation carries source provenance;
   on failure, surface `path/in/file.json → token.name → reason`.
3. Persist settings (separator, ref mode, update-existing) in
   `clientStorage`.

## 5. UI ↔ code message contract

```ts
// UI → code
type ToCode =
  | { type: 'readClientStorage'; keys: string[] }
  | { type: 'writeClientStorage'; entries: Record<string, unknown> }
  | { type: 'applyPlan'; plan: VariablePlan }
  | { type: 'cancel' };

// code → UI
type ToUI =
  | { type: 'clientStorage'; entries: Record<string, unknown> }
  | { type: 'progress'; pct: number; line: string; tone: LogTone }
  | { type: 'done'; created: number; updated: number; errors: PlanError[] }
  | { type: 'error'; message: string };
```

Keep this union the single coupling point. Any new feature adds
variants; nothing else crosses the boundary.

## 6. Risks & open questions

- **DTCG composite types** (`shadow`, `gradient`, `typography`) are not
  in M1–M4. Decide in M5 whether to (a) skip with warning, (b) flatten
  to multiple primitive variables, or (c) defer to a follow-up
  requirement.
- **GitLab self-signed certs** on internal hosts — Figma's iframe
  `fetch` honors the browser's trust store, which on macOS may reject
  internal CAs. May need a "trust this cert" guide rather than code.
- **Theme detection heuristic** could misfire when two files happen to
  share structure but are not themes. M2 ships the heuristic; if it
  bites, the M4 settings UI lets the user override.

## 7. Out of scope (cross-reference to constitution non-goals)

Editing tokens in Figma, cloud sync, telemetry, non-DTCG formats,
exports to CSS/Style Dictionary. See [constitution.md](constitution.md) §1.
