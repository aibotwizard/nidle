# Implementation Plan — req-0001

Implements [requirements/req-0001.md](requirements/req-0001.md) under the
gates set by [constitution.md](constitution.md). This document covers the
**how**; the constitution covers the **why**.

Status legend: **[implemented]** shipped in the current MVP ·
**[planned]** designed, not yet built. See
[constitution.md](constitution.md) §2 for milestone definitions.

## 0. Scope (what ships today)

The current build is M1 + M2 + M4 + M5 — only **M3 (GitLab source)** is
outstanding from the original five-milestone roadmap.

- **[implemented]** Folder upload via the system file picker (M1).
- **[implemented]** DTCG parse for `color` / `dimension` / `number` (M1).
- **[implemented]** 4-step UI matching the design asset (Source → Sets →
  Preview → Import), with hover/disabled states and progress animation
  (M1).
- **[implemented]** Aliases (`{a.b.c}`) resolved across files, with a
  `Keep as alias` ↔ `Resolve to raw value` setting; see
  [decisions/0009-keepalias-preserves-direct-hop.md](decisions/0009-keepalias-preserves-direct-hop.md)
  for the chain-handling decision (M2).
- **[implemented]** Theme detection: sibling files with matching shape
  fold into modes of one collection (M2).
- **[implemented]** Three-collection layout driven by folder convention
  (`core/`, `semantic/`, `components/`) (M4).
- **[implemented]** Group separator (slash ↔ dot) and update-existing
  toggle, persisted in `clientStorage` (M4).
- **[implemented]** Settings sheet: gear icon opens a sheet with
  reference handling, separator, update-existing, and a read-only
  theme→mode mapping list (M2).
- **[implemented]** Streaming progress, per-token error reporting,
  settings persistence (M5 — shipped incidentally with the M1/M2
  architecture).
- **[planned]** GitLab tab: the source segmented control shows Upload
  only; GitLab is not rendered until M3.

## 1. Target technology

- **Figma plugin** — Manifest v3, `editorType: ["figma"]`, runs in Figma
  Design only.
- **UI layer** — single-page plugin iframe, React 19 function
  components in TypeScript (see
  [decisions/0012-react-ui-layer.md](decisions/0012-react-ui-layer.md);
  supersedes the vanilla-TS choice in ADR-0002). The asset's CSS
  transfers verbatim; JSX reuses its classNames 1:1.
- **Plugin (sandboxed) code** — TypeScript, talks to the UI over
  `postMessage`. All Figma Variables API calls live here.
- **Bundler** — `esbuild`. Two entry points (`main.tsx`, `code/index.ts`)
  → two bundles. Automatic JSX runtime; UI bundle minified with
  `process.env.NODE_ENV` defined to `"production"`.
- **Tests** — `vitest` for parser/resolver logic (node env) and a
  jsdom + Testing Library flow test for the React wizard; visual
  conformance is enforced manually by the UX agent (see
  constitution §3.3).

## 2. Repository layout

```text
plugin/
  manifest.json
  build.mjs             # esbuild — two entrypoints, inlines CSS+JS into ui.html
  src/
    code/               # Figma sandbox side
      index.ts          # message router + applyPlan + clientStorage I/O
      messages.ts       # typed UI ↔ code messages
    ui/                 # iframe side (single bundle, no router)
      index.html        # shell; CSS+JS injected at build
      index.css
      main.tsx          # entry: wires transport + settings store, mounts <App/>
      App.tsx           # composition root: reducer, hooks, 4-step layout
      state/            # appState.ts — wizard State/Action types + reducer
      hooks/            # useSettings, useSandboxMessages, usePlan
      components/       # TitleBar, Stepper, Step*, Footer, SettingsSheet, shared/
      settings/         # framework-agnostic settings store + storage adapters
      transport/        # postMessage multiplexer (sole owner of window.message)
      intake/           # fileReader, dataTransfer (browser File/drop plumbing)
    shared/
      dtcg/
        parse.ts        # DTCG file → flat Token[]
        resolve.ts      # alias resolution (keepAlias | resolve)
        types.ts        # DTCG $type union, Token, ParseResult
      mapping/
        toFigma.ts      # tokens → CollectionPlan[] + VariableOp[] + ThemeGroup[]
  tests/
    fixtures/
      m1-primitives/
      m2-aliases-themes/
      m4-multi-collection/
    parse.spec.ts       # DTCG parse + m1 planForFiles fixture coverage
    resolve.spec.ts     # alias resolver: chains, cycles, type mismatches
    toFigma.spec.ts     # M2 themes/aliases + M4 multi-collection fixtures
specs/                  # constitution, plan, ADRs, agents, assets, requirements
```

**Planned additions** (each gated on its milestone):
- `src/shared/gitlab/client.ts` — REST v4 `listTree` / `getBlob` (M3).
- `src/code/figmaVariables.ts` — if `code/index.ts` outgrows ~300 lines after
  M3, extract the figma.variables.* wrapping (M5 polish).

`plugin/` is intentionally separate from `specs/` so the spec bundle can
be edited without touching shipping code, and vice versa.

## 3. Data flow

```text
[Source]                [Parse]            [Resolve]            [Plan]              [Apply]
GitLab REST  ─┐                                                                              
              ├─►  UploadedFile[]  ─► Token[]  ─► ResolvedToken[]  ─► VariablePlan  ─► figma.variables.*
Upload (FS)  ─┘                                                                              
```

- **Token[]**: flat list, each token carries `{ name, type, value, file }`
  where `name` is slash-joined and `value` is either a literal or a raw
  alias string `"{a.b.c}"`. The parser does not build a nested tree —
  flatness simplifies cross-file alias resolution.
- **ResolvedToken[]**: same shape, with `value` discriminated as
  `{ kind: 'literal', value } | { kind: 'alias', targetName }`. The
  resolver enforces termination, cycle detection, and target-type match.
- **VariablePlan**: `{ collections: CollectionPlan[], variables:
  VariableOp[], themeGroups: ThemeGroup[], warnings: ParseWarning[] }`.
  Each `VariableOp` carries one entry per mode and a `create` /
  `createOrUpdate` marker driven by settings. The plan is computed
  entirely UI-side, sent to `code/` as one `applyPlan` message, and
  applied in three phases (collections+modes → materialise variables →
  write values + alias edges).

Computing the full plan before any Figma mutation gives us (a) an
accurate Step 3 preview, (b) an easy dry-run path for tests, and
(c) `themeGroups` reuse for the settings sheet's read-only theme→mode
display.

## 4. Milestone → work breakdown

### M1 — Walking skeleton (Upload + Primitives)

1. Scaffold `manifest.json`, two-entry esbuild config, `npm` scripts.
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
   detection. Two output modes: `keepAlias` returns
   `{ kind: 'alias', targetName }` pointing at the **direct** hop the
   author wrote (chains are walked only to validate termination and
   type match — not collapsed, since Figma supports variable-to-variable
   aliases at any depth and collapsing would lose semantic intent like
   `button → accent.primary` vs `button → color.blue.500`). `resolve`
   mode substitutes the chain-tip literal.
2. Wire the reference-handling toggle in the settings sheet to the plan
   computation; persist via `clientStorage` round-trip.
3. Theme detection: sibling files in the same directory whose `(name,
   type)` shape matches across every file become **modes** of one
   collection (each file = one mode, named from the basename). A lone
   file in a directory keeps the single `Value` mode. Heuristic in
   `mapping/toFigma.ts` and surfaced on `plan.themeGroups`.
4. Settings sheet: render theme → mode mapping list (read-only —
   editability deferred; the heuristic has not yet misfired in practice).
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

1. Folder convention in `mapping/toFigma.ts` via `collectionForFile`:
   `core/*` → Primitives, `semantic/*` → Semantic,
   `components/*` → Components. Unknown top-level folders → Primitives
   with a warning. Flat uploads (no folder) → Primitives silently, to
   preserve M1 walking-skeleton behaviour.
2. Group separator setting threads through to variable-name emission
   via the `emitName(name, separator)` helper applied at plan time, not
   at parse time — so alias `targetName` and variable `name` use the
   same separator and round-trip cleanly through Figma's variable
   panel.
3. "Update existing variables": plan op tagged `'create' |
   'createOrUpdate'` at planner time; the sandbox looks up
   `(collection, name)` in a single `getLocalVariables()` scan and
   either updates in place or records a skip error when
   `updateExisting=false` and the variable already exists.
4. Fixture `m4-multi-collection/` matching the three-collection
   structure shown in the design, exercising cross-collection aliases
   (Components → Semantic → Primitives).

### M5 — Polish & resilience (implemented incidentally)

These items shipped without a dedicated milestone push because the
architecture chosen for M1 (one `applyPlan` message + per-batch progress
posting + source provenance on every op) already supplied them.

1. Streaming progress: `code/` posts `{type: 'progress', pct, line,
   tone}` between batches; UI animates the bar and appends to the
   console. Posted at every ~5% in `writeValues`.
2. Per-token errors: every `PlanError` carries `{ variable, reason,
   source: { file, path } }`; rendered in the import log and the Step 4
   stats panel.
3. Settings persisted via the `readSettings`/`writeSettings` message
   pair against `figma.clientStorage` under key `boppli.settings.v1`.
   Unknown keys are tolerated on read (schema migration is just
   `{ ...DEFAULT_SETTINGS, ...stored }`).

**Remaining nice-to-haves** (not gating any milestone):
- Partial DOM updates during import progress (currently the UI does a
  full `render()` on every progress tick — fine at ≤20 ticks).
- Editable theme→mode mapping in the settings sheet (for when the
  shape-match heuristic misfires; defer until a real misfire is seen).

## 5. UI ↔ code message contract

```ts
// UI → code
type ToCode =
  | { type: 'applyPlan'; plan: VariablePlan }
  | { type: 'readSettings' }
  | { type: 'writeSettings'; settings: StoredSettings }
  | { type: 'close' };

// code → UI
type ToUI =
  | { type: 'progress'; pct: number; line: string; tone: LogTone }
  | { type: 'done'; created: number; updated: number; errors: PlanError[] }
  | { type: 'error'; message: string }
  | { type: 'settings'; settings: StoredSettings };
```

`StoredSettings = Partial<MappingSettings>` — only set keys round-trip
through `clientStorage`, so older installs upgrading to a new settings
schema fill missing keys from `DEFAULT_SETTINGS` on read.

Keep this union the single coupling point. Any new feature adds
variants; nothing else crosses the boundary. M3 will add GitLab-specific
variants (`connectGitlab`, `gitlabTree`, etc.) without touching the
existing ones.

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
