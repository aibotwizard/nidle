# Architecture

The structure of the code: what the modules are, where the seams sit,
which invariants span them, and where the current design is under
strain.

- **What the code must do** → [specification.md](specification.md)
- **Milestone work breakdown** → [plan.md](plan.md) (AO-owned)
- **Binding decisions** → [decisions/](decisions/)

[plan.md](plan.md) is the milestone-by-milestone implementation plan.
This document is the standing reference for the shape of the system —
read it before moving code across a stage boundary.

---

## 1. Architectural shape

Five stages, one direction:

```text
 intake  →  parse  →  resolve  →  plan  →  apply
   │          │          │          │        │
 files     Token[]  ResolvedToken[] Variable  figma.
 in mem                              Plan     variables.*
```

New code lands **inside** one of these stages. A feature that appears
to need a sixth stage is a constitution question, not a new folder
([agents/ao.md](agents/ao.md)).

Two properties fall out of this shape and are worth defending:

1. **The plan is a value.** Everything up to `apply` is a pure function
   over JSON. The plan can be computed, previewed, diffed, and asserted
   without a Figma runtime (**ADR-0001**).
2. **The preview is not a simulation.** Step 3 renders the exact object
   that `apply` consumes. There is no second code path that could
   drift.

---

## 2. Runtime topology

A Figma plugin is two isolated JavaScript contexts:

| Context | What it is | What it may do |
|---------|-----------|----------------|
| **UI** (`src/ui/`) | React 19 in an iframe | DOM, `File`, drag & drop, `fetch` (M3). **No** Figma API. |
| **Sandbox** (`src/code/`) | Figma's plugin VM | `figma.variables.*`, `figma.clientStorage`. **No** DOM. |

They communicate only by `postMessage`. Because the Figma Variables API
exists **only** in the sandbox, and file reading exists **only** in the
UI, the stage split follows the runtime split:

- **UI owns** intake, parse, resolve, plan.
- **Sandbox owns** apply.
- **`src/shared/`** is importable by both and must stay free of `figma.*`
  and of DOM globals.

One `applyPlan` message carries the whole plan across (**ADR-0001**).
This is the only coupling point that matters; keep it that way.

---

## 3. Module map

### 3.1 `src/shared/` — pipeline logic, no runtime dependencies

| Module | Responsibility | Depth |
|--------|---------------|-------|
| `intake/tokenIntake.ts` | `fromUploads(RawUpload[]) → IntakeResult`; expands Tokens Studio sets, parses, buckets tokens by file. | shallow — see §7.2 |
| `dtcg/parse.ts` | DTCG tree walk → flat `Token[]`; value normalisation; colour and dimension codecs. | deep core, over-wide surface |
| `dtcg/resolve.ts` | Transitive alias resolution with cycle and type validation. | **deep** — best ratio in the codebase |
| `mapping/toFigma.ts` | `planForFiles(FileTokens[], MappingSettings) → VariablePlan`; collection routing, theme detection, name emission. | deep core, four jobs in one file |
| `writer/variableWriter.ts` | `write(plan, api) → WriteReport`; sequences the three apply phases. | thin sequencer — see §7.4 |
| `writer/setupCollections.ts` | Phase 1: collections and modes; owns the `defaultModeId` invariant. | real, single-use |
| `writer/upsertVariables.ts` | Phase 2: index existing variables, create or reuse. | **deep** |
| `writer/writeValues.ts` | Phase 3: coerce and write values; progress and yielding. | right size, wrong cut |
| `writer/coerceValue.ts` | `ValueSpec` → a value the Figma port accepts. | shallow — see §7.4 |
| `writer/inMemoryFigmaApi.ts` | Test adapter for the `FigmaApi` port. | see §7.3 |

### 3.2 `src/code/` — the sandbox

| Module | Responsibility |
|--------|---------------|
| `index.ts` | Message router; `applyPlan` handler; `clientStorage` I/O; UI geometry. |
| `figmaApiLive.ts` | The production `FigmaApi` adapter. The only file that names `figma.variables.*`. |
| `messages.ts` | The `ToCode` / `ToUI` union. |

### 3.3 `src/ui/` — the iframe

| Module | Responsibility |
|--------|---------------|
| `main.tsx` | Composition root: builds the io singletons, mounts `<App/>`. |
| `App.tsx` | Wiring only: reducer, two effects, step switch. |
| `state/machine.ts` | Wizard `Phase` union + settings + reducer; `Action ⊇ ToUI`. |
| `io/transport.ts` | `postMessage` multiplexer — sole owner of `window.message`. |
| `io/settingsIO.ts` | Storage port, both adapters, `mergeWithDefaults` validation. |
| `io/intake.ts` | Picker + drop producers; owns the upload path contract. |
| `components/` | One module per screen and control; classNames map 1:1 to the design asset. |

The UI layer is React by **ADR-0012** (supersedes ADR-0002); the
14-module consolidated layout is **ADR-0013**. The `io/` modules stay
framework-free so they remain testable in plain Node.

---

## 4. Data shapes at the boundaries

```ts
RawUpload      { path, json }
Token          { name, type, value: string | number, file }
ResolvedToken  { name, type, file, value: ResolvedValue }
ResolvedValue  { kind:'literal', value } | { kind:'alias', targetName }
VariablePlan   { collections, variables, warnings, themeGroups }
VariableOp     { collection, name, resolvedType, values, source, op }
ValueSpec      { kind:'literal', value } | { kind:'alias', targetCollection, targetName }
WriteReport    { created, updated, errors }
```

Two shapes carry more meaning than their types express:

- **`Token.value: string | number`** is tri-state — a colour literal, a
  numeric literal, **or** an unresolved alias string `"{a.b.c}"`. Only
  a doc comment says so, and the resolver needs `as string` casts to
  work around it.
- **`Token.file`** is meaningless to the resolver, which only copies it
  through so the planner two stages later can key
  `` `${file}::${name}` ``. A field rides through a module that has no
  use for it.

---

## 5. Seams and adapters

Three ports. The rule is *one adapter is a hypothetical seam, two is a
real one* — all three clear that bar, though not all three are equally
healthy.

### 5.1 `FigmaApi` — the Figma Variables port

Seven methods, deliberately narrow: `listCollections`,
`createCollection`, `renameMode`, `addMode`, `listVariables`,
`createVariable`, `setValueForMode`. No node access, no deletion, no
publishing.

Adapters: `code/figmaApiLive.ts` (production) and
`writer/inMemoryFigmaApi.ts` (tests). This is what makes the entire
apply stage testable in Node. It is also the weakest seam in practice —
see §7.3.

### 5.2 `SettingsStorage` — persistence port

`load()` / `save()`. Adapters: `postMessageStorage` (production, routes
to `figma.clientStorage` through the sandbox) and `inMemoryStorage`
(tests). Lets the settings store be tested with no jsdom and no Figma.

### 5.3 `SandboxTransport` — the postMessage multiplexer

The **sole** owner of `window.addEventListener("message")`. It unwraps
`e.data.pluginMessage` and fans out to N subscribers, which is what
lets the settings store and the wizard reducer coexist on one global
event. Small, and load-bearing.

---

## 6. Message contract

```ts
// UI → sandbox
type ToCode =
  | { type: 'applyPlan';     plan: VariablePlan }
  | { type: 'readSettings' }
  | { type: 'writeSettings'; settings: StoredSettings }
  | { type: 'close' };

// sandbox → UI
type ToUI =
  | { type: 'progress'; pct: number; line: string; tone: LogTone }
  | { type: 'done';     created: number; updated: number; errors: PlanError[] }
  | { type: 'error';    message: string }
  | { type: 'settings'; settings: StoredSettings };
```

`StoredSettings = Partial<MappingSettings>` — only set keys round-trip,
so a schema addition fills from defaults on read.

Every new message type goes through the AO ([agents/ao.md](agents/ao.md)).
M3 adds GitLab variants without touching the existing four.

---

## 7. Cross-module invariants and current friction

These are the places where correctness depends on two modules agreeing
about something neither one states. They are listed worst-first.

### 7.1 The upload path contract — **resolved (ADR-0013)**

> Closed 2026-08-19: `io/intake.ts` owns the contract (paths are
> root-relative, producers normalize), and `tests/ui/intake.spec.ts`
> pins drop ≡ pick. The description below is kept as the record of the
> original defect.

`ui/intake/dataTransfer.ts` produces `webkitRelativePath`;
`ui/intake/fileReader.ts` consumes it and unconditionally strips the
first segment. The two disagree about whether a throwaway root segment
is present.

| Source | Produced path | After strip | Routes to |
|--------|--------------|-------------|-----------|
| Picker, folder `tokens/` | `tokens/core/color.json` | `core/color.json` | **Primitives** ✅ |
| Drop, folder `tokens/` | `tokens/core/color.json` | `core/color.json` | **Primitives** ✅ |
| Drop, folder `core/` | `core/color.json` | `color.json` | Primitives + **wrong** ❌ |

The drop traversal grafts `prefix + entry.name`, where `prefix` starts
empty — so the dropped directory itself is the first segment, and
stripping it destroys the folder that drives collection routing. The
picker includes the root folder *above* it, so the same strip is
correct there.

Neither file states the contract. The UI flow test hardcodes
`webkitRelativePath = "tokens/" + path`, encoding the picker's shape
and never running the drop producer at all. Both modules look correct
in isolation; the bug lives in the seam. (FR-106.)

### 7.2 The intake stage imports from the plan stage

`shared/intake/types.ts` imports `FileTokens` from
`shared/mapping/toFigma.js` — stage 1 depending on stage 4, the only
backwards edge in `shared/`. `RawUpload` is also structurally identical
to `parse.ts`'s `UploadedFile`, down to a verbatim-duplicated doc
comment, and `tokenIntake.ts` exists partly to retype one into the
other. `IntakeResult.parseFailures` is declared here but hardcoded
empty — the field is only ever populated by a different module in a
different layer.

### 7.3 The test adapter diverges exactly where production is careful

`inMemoryFigmaApi.ts` is 155 lines against `figmaApiLive.ts`'s 136 —
the fake is larger than the thing it fakes, because it re-implements
Figma's object model rather than recording calls. It diverges on four
behaviours, and each divergence disables the production code written to
survive it:

| Fake behaviour | Production code it makes untestable |
|----------------|-------------------------------------|
| `defaultModeId` hardcoded to `modes[0]` | the `defaultModeId` guard in `setupCollections` — the white-COLOR-variable bug (FR-503) |
| `addMode` never throws | mode-limit fallback, `skippedModes`, the suppression that depends on it (FR-504) |
| `setValueForMode` accepts any type | the coercion-failure error path (FR-511) |
| `createVariable` never rejects a name | the create-failure error path (FR-512) |

All fourteen writer tests run through this adapter, so every correctness
claim about apply rests on a model that is wrong precisely where it
matters. `figmaApiLive.ts` itself has **zero** tests — including
`sameVariableValue`, a pure epsilon-comparison function that is trivial
to test, and a module-level `verifyCount` that is shared across every
adapter instance in a sandbox session rather than per-adapter.

### 7.4 The apply stage's internal seams are private

`write → setupCollections → upsertVariables → writeValues → coerceValue`
is a linear chain in which **every** function has exactly one call site,
and every one of those call sites is inside `writer/`. No test targets
any of them directly. They are file-level boundaries around a private
call chain.

Two are worth acting on:

- **`coerceValue` is shallow and leaks.** Three parameters, sixteen
  lines, one call site. It returns bare `null` on failure, discarding
  *which* branch failed — and its only caller then re-discriminates the
  same union to reconstruct the reason. Ten lines of caller exist to
  undo a sentinel protocol. Inlining it removes code and adds
  information.
- **`writeValues` takes seven parameters, two of them dead weight.**
  `created` and `updated` cross the boundary solely so the module can
  interpolate them into a log string.

### 7.5 Colour coerces three stages later than dimension

Dimensions are coerced to px at **parse** time (ADR-0011), so the
writer never sees `"1rem"`. Colours travel through resolve *and* plan as
raw strings and are only parsed at **write** time. That asymmetry is
the sole reason `writer/coerceValue.ts` imports `dtcg/parse.ts` — the
one stage-skipping import in the codebase, stage 5 reaching back to
stage 2.

Consequence: `FigmaRgba` in `writer/types.ts` and `Rgba` in
`dtcg/parse.ts` are the same shape under two names, and the seam
typechecks only by structural coincidence.

### 7.6 Two contradictory collision policies for one key

The resolver flattens all files into one namespace and indexes tokens
by name **last-write-wins**. A hundred lines away, the planner indexes
the same key **first-match-wins**, with a comment explaining why
first-match is correct for theme overrides. Neither policy is tested,
and they disagree.

### 7.7 The settings sub-system is a shallow module stack — **resolved (ADR-0013)**

> Closed 2026-08-19: settings state lives in the wizard reducer;
> `io/settingsIO.ts` holds the port, both adapters, and validation. The
> load now times out to defaults instead of hanging, and the real
> `postMessage` adapter is tested. Record of the original finding:

Six modules and ~163 UI lines (plus ~14 in the sandbox) persist **three**
fields — roughly 59 lines per field. The store's listener `Set` and
`broadcast` fan-out serve exactly one subscriber and one writer. Its
`hydrateFrom` method is declared in the public return type, implemented,
documented, and **called from nowhere**, duplicating a block ten lines
above it.

The adapter seam is also tested backwards: the trivial in-memory
adapter has four test sites, while the real `postMessageStorage` has
none — and it is the one with a real hazard, resolving its load promise
on the first `settings` message with no timeout and no error path.

### 7.8 Four fields encode a three-state machine — **resolved (ADR-0013)**

> Closed 2026-08-19: `state/machine.ts` models the lifecycle as a
> discriminated union; `importBlockedEmpty` was deleted rather than
> re-pinned. Record of the original finding:

`State` carries `importing: boolean`, `done: boolean`, `progress:
number`, and `result?`. The lifecycle has three states (idle →
running → finished), so illegal combinations like
`{importing: true, done: true}` typecheck. The three-way decode is
re-implemented in two components that could disagree, one of which has
a silent fall-through for the state neither branch names.

Related: `importBlockedEmpty` is unreachable — the only button that
dispatches it is disabled under exactly the condition that would fire
it — yet it has a dedicated reducer test.

### 7.9 Progress has no owner — **resolved (2026-08-19)**

> Closed under req-0003: `variableWriter` owns one monotonic scale;
> callees report local phase fractions. Original finding: three modules
> emitted progress on three unrelated scales, and nothing owned
> monotonicity or a phase budget (FR-805).

### 7.10 A stale doc comment contradicts an ADR

`resolveTokens`'s doc comment still describes chain-collapsing
("resolves to a single alias on `c`"). The implementation and ADR-0009
preserve the author's direct hop. The code is right; the comment
misleads.

---

## 8. Testing architecture

| Suite | Runs | Covers |
|-------|------|--------|
| `parse.spec.ts` | node | DTCG walk, value codecs, M1 fixture |
| `resolve.spec.ts` | node | chains, cycles, type mismatches — the cleanest suite |
| `toFigma.spec.ts` | node | M2 themes, M4 multi-collection, fixture-driven |
| `tokenIntake.spec.ts` | node | bucketing, warning pass-through |
| `variableWriter.spec.ts` | node | apply, through the in-memory `FigmaApi` |
| `settingsIO.spec.ts` | node | validation + both storage adapters, incl. load timeout |
| `ui/machine.spec.ts` | node | reducer lifecycle edges, log truncation |
| `ui/intake.spec.ts` | node | the path contract: drop ≡ pick (FR-106) |
| `ui/appFlow.spec.tsx` | jsdom | the real wizard end to end, error path, settings→DOM |

Visual conformance is enforced by the UX agent reading the design asset,
not by snapshots (constitution §3.3).

Three structural notes:

- **`appFlow.spec.tsx` is the strongest asset in the suite.** It renders
  the real components and runs the real `fileReader`, `fromUploads`, and
  `planForFiles`, faking only the transport and storage — at exactly the
  right boundary.
- **`toFigma.spec.ts` is fixture-driven with `any`-typed loops.** The
  specification lives in `expected.json`, and a renamed fixture key makes
  the loop iterate zero times while the test still passes.
- **Reducer-only tests certify dead code.** The reducer suite's five
  tests include one of real value (error-log truncation, painful to
  stage end-to-end), three that duplicate what `appFlow` already proves,
  and one pinning a branch the user cannot reach.

Since ADR-0013 the UI-side adapters (`io/intake`, `io/settingsIO`) are
tested directly; of the once-untested adapter modules only
`io/transport` (29 trivial lines) and `figmaApiLive` (see §7.3 and
req-0004) remain unpinned.

---

## 9. Constraints that are already decided

Do not re-litigate these without a superseding ADR:

| Constraint | ADR |
|-----------|-----|
| Plan-then-apply; only `applyPlan` may call `figma.variables.*` | 0001 |
| Single inlined `ui.html`, no external resources | 0003 |
| Upsert by `(collection, name)`, idempotent by default | 0004 |
| DTCG · 2025.10 only | 0005 |
| MVP is upload-only; no GitLab tab until M3 | 0006 |
| `networkAccess: ["none"]` until M3 | 0008 |
| `keepAlias` preserves the direct hop, not the chain tip | 0009 |
| Writer yields to the event loop per progress tick | 0010 |
| Dimensions coerce to px; 1rem = 16px | 0011 |
| React UI layer (supersedes 0002) | 0012 |

---

## 10. Rules for changing this architecture

1. Code lands inside an existing stage, or the stage list changes by
   constitution amendment.
2. Imports flow forward only. A backwards or stage-skipping import is a
   defect, not a shortcut (§7.2, §7.5).
3. `src/shared/` names neither `figma.*` nor DOM globals.
4. New UI ↔ sandbox traffic extends the `ToCode` / `ToUI` union and
   nothing else.
5. A new module earns its file by hiding a decision. A function with one
   call site inside its own folder and no test of its own is a candidate
   for inlining, not a module.
6. A new adapter for an existing port must be a **recorder or a seeded
   stub**, not a re-implementation of the system it stands in for
   (§7.3).
