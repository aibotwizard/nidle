# Development Roadmap

Where the product is, what ships next, and in what order.

**Authority:** [constitution.md](constitution.md) §2 is the ratified
roadmap and only the PO may amend it ([agents/po.md](agents/po.md)).
This document elaborates it: it tracks delivered milestones, sequences
the work that is already ratified, and stages **proposed** milestones
for PO ratification. An item marked `proposed` is not committed scope
until it lands in the constitution.

Requirement IDs (FR-nnn) refer to
[requirements/feature-requirements.md](requirements/feature-requirements.md).
Architecture references (§n) refer to
[architecture.md](architecture.md).

---

## 1. Status today

| Milestone | Scope | Status |
|-----------|-------|--------|
| **M1** | Walking skeleton — upload, DTCG parse, Primitives collection, 4-step UI | **shipped** |
| **M2** | Aliases and themes → modes; settings sheet | **shipped** |
| **M3** | GitLab source | **not started** |
| **M4** | Three-collection layout, separator, update semantics | **shipped** |
| **M5** | Streaming progress, per-token errors, settings persistence | **shipped** (incidentally, with M1/M2) |

The build is **M1 + M2 + M4 + M5**. M3 is the only outstanding item
from the original five.

Four requirements are stated but **not met** — FR-106, FR-514, FR-805,
FR-906 — and seventeen are met but unpinned by any test. These are not
milestone scope; §3 handles them.

---

## 2. Sequencing principles

1. **Defects do not wait for milestones.** A stated requirement that is
   not met is remediation work, sequenced by severity, shipped when
   ready (§3).
2. **A milestone ships whole.** M3 lands with its tests and its
   manifest amendment, not as a stub behind a flag (ADR-0006 exists
   precisely because half-lit affordances erode trust).
3. **Structural work is justified by the feature it unblocks**, not by
   tidiness. §4 is sequenced ahead of M3 only where M3 would otherwise
   inherit the problem.
4. **Non-goals stay non-goals.** Token editing, cloud sync, telemetry,
   non-DTCG formats, and non-Figma export are out
   ([constitution.md](constitution.md) §1). Requests route to the PO,
   not into a milestone.

---

## 3. Now — remediation

Not a milestone. Each item is independently shippable; ship in this
order. Specified by
[requirements/req-0002](requirements/req-0002-deterministic-import.md)
(§3.1, §3.2, §3.4) and
[requirements/req-0003](requirements/req-0003-honest-diagnostics.md)
(§3.3, §3.5).

### 3.1 Reconcile the upload path contract — **done (2026-08-19, ADR-0013)**

Closed by the UI rewrite: `io/intake.ts` owns path normalisation, the
contract is stated at the producer, and `tests/ui/intake.spec.ts`
drives both producers — dropping `core/` and picking it yield identical
plans. Original item kept for the record:

FR-106, §7.1. Drag-and-drop and the file picker disagree about whether
the relative path carries a throwaway root segment, so dropping a
`core/` folder directly loses the segment that routes the collection.
Silent wrong output, not an error.

- One module owns path normalisation, and the contract is stated where
  it is produced.
- A test drives the **drop** producer, not just the picker shape.

**Done when:** dropping `core/` and picking its parent yield identical
plans.

### 3.2 Validate settings on the sandbox side — **done (2026-08-19)**

`mergeWithDefaults` moved to `shared/mapping/toFigma.ts`; both the UI
store and the sandbox's `readSettings` run the same whitelist. Original
item kept for the record:

FR-906. The UI validates properly; the sandbox casts `clientStorage`
output behind a bare `typeof` check. Move the existing validation
behind the port so both sides share it.

**Done when:** a corrupt stored value falls back to its default on
either side of the boundary, with a test.

### 3.3 Give progress a single owner — **done (2026-08-19)**

`variableWriter` owns one monotonic 0–100 scale (setup 0–10, writes
10–100); callees emit local fractions. Pinned by a
nondecreasing-percentages test. Original item kept for the record:

FR-805, §7.9. Three modules emit on three unrelated scales; a
three-collection plan posts three consecutive events all claiming 5%.
Assign a phase budget in one place.

**Done when:** percentages are monotonic across an import, asserted by
a test.

### 3.4 Close the separator/upsert interaction

FR-514. Changing the separator between runs breaks the
`(collection, name)` match and duplicates every variable — acknowledged
in ADR-0004's negative consequences and never closed. Decide between
re-keying and warning the user; record the decision as an ADR.

**Done when:** a separator change either re-keys cleanly or warns
before writing.

### 3.5 Delete what is dead, fix what misleads

**Done 2026-08-19**: the dead exports and the module that carried them
went away with the ADR-0013 rewrite; D-3 and D-6 now surface in the
console ([requirements/req-0003](requirements/req-0003-honest-diagnostics.md)).
Still open from this list: the stale `resolveTokens` doc comment
(§7.10) — fixed alongside any future `resolve.ts` change.

### 3.6 Blocked on a PO ruling

Tokens Studio support ships but is a declared non-goal
([../docs/spec-deviations.md](../docs/spec-deviations.md) D-5).
[requirements/req-0005](requirements/req-0005-tokens-studio-scope.md)
puts the choice — ratify, remove, or tolerate — to the PO. No
engineering work starts until it is answered; removal would touch two
stages.

---

## 4. M6 — Seam hardening · **proposed**

Specified by
[requirements/req-0004](requirements/req-0004-verifiable-apply-stage.md)
(§4.1, §4.2).

Sequenced **before** M3 because M3 adds a third source adapter, a
network port, and credential persistence — it inherits every weakness
in §3.1, §7.3, and §7.7 and multiplies it.

Keep this milestone small. It is not a rewrite; it is four specific
repairs, each with a test that could not have been written before.

### 4.1 Make the `FigmaApi` test adapter honest

§7.3. The fake is larger than the real adapter and diverges on exactly
the four failure modes the production code handles, leaving FR-503,
FR-504, FR-511, and FR-512 unverifiable.

- Seed knobs for `defaultModeId`, the mode limit, type rejection, and
  duplicate-name rejection.
- Tests for the four paths those knobs unlock — including the
  default-mode guard that prevents COLOR variables rendering white.

### 4.2 Test the production adapters

§8. `figmaApiLive`, `postMessageStorage`, `sandboxTransport`, and
`dataTransfer` were extracted to be testable and never tested. Start
with `sameVariableValue` (a pure function) and the
`postMessageStorage` load promise that never settles if the sandbox
stays silent.

### 4.3 Collapse the apply stage's private seams

§7.4. Inline `coerceValue` — three parameters, one call site, and a
`null` sentinel its only caller decodes by re-discriminating the same
union. Removing it deletes code and *adds* the failure reason each
branch already knew. Drop `writeValues`'s two log-only parameters.

### 4.4 Move colour coercion to parse

§7.5. Dimensions coerce at parse (ADR-0011); colours coerce at write.
That asymmetry is the only reason stage 5 imports stage 2. Coerce
colour where dimension is already coerced, and the last stage-skipping
import goes with it.

**Entry:** §3 complete.
**Exit:** FR-503, FR-504, FR-511, FR-512 verified; no backwards or
stage-skipping imports in `src/shared/`; a new ADR recording the
recorder-not-simulator rule for test adapters
([architecture.md](architecture.md) §10.6).

---

## 5. M3 — GitLab source · ratified

Already in [constitution.md](constitution.md) §2. Reuses parse → resolve
→ plan → apply unchanged; the work is a source adapter, a form, and a
manifest amendment.

1. `shared/gitlab/client.ts` — `listTree` and `getBlob` over REST v4,
   PAT in the `PRIVATE-TOKEN` header. FR-110.
2. GitLab tab: instance URL, PAT, project path, branch, subfolder —
   already designed in the asset. FR-108.
3. Credential persistence through the sandbox to `clientStorage`;
   pre-fill on boot. FR-109.
4. `ToCode` / `ToUI` gain GitLab variants; the existing four are
   untouched ([architecture.md](architecture.md) §6).
5. **Manifest amendment** — `networkAccess` narrows from `["none"]` to
   the configured host. ADR-0008 defers the choice between
   install-time configuration and a per-install build to a new ADR
   written when M3 starts. FR-905.
6. No new fixture: the M2 token set, served through a mocked client.

**Entry:** M6 complete — GitLab lands on repaired seams, and the
credential path reuses the validated settings port from §3.2.
**Exit:** a user with a PAT reaches Step 2 with the file tree populated
against a locally hosted instance; the manifest names that host and no
other; the new ADR is filed.

**Known risk:** self-signed certificates on internal hosts. Figma's
iframe `fetch` honours the OS trust store, which may reject internal
CAs. Likely a documentation answer rather than a code one — confirm
early, because it changes what "done" means.

---

## 6. M7 — Composite token types · **proposed**

The largest remaining gap against DTCG · 2025.10. `shadow`,
`typography`, `gradient`, `border`, and friends currently skip with a
warning (FR-205, FR-213), which is honest but incomplete.

Three options, unresolved — a PO decision, not an AO one:

| Option | Consequence |
|--------|-------------|
| Keep skipping with a warning | Status quo. Zero cost, permanent gap. |
| Flatten to several primitive variables | `shadow` → offset-x, offset-y, blur, spread, colour. Importable, but the composite intent is lost and round-trip is impossible. |
| Defer to a follow-up requirement | Honest if composites are not what users are asking for. |

**Prerequisite:** evidence. Count composite tokens in the real token
sets users bring before choosing. Do not build this on speculation.

---

## 7. Parked

Not scheduled. Listed so they are not rediscovered as new ideas.

| Item | Why parked |
|------|-----------|
| Editable theme → mode mapping (FR-609) | The shape-match heuristic has not been observed to misfire. Build it when it does. |
| Partial DOM updates during import | React reconciliation made this moot (ADR-0012). |
| Configurable rem base | ADR-0011: a configurable base invites source/target drift that is near-impossible to debug. |
| Bundling webfonts as base64 | Only if UX judges the system-font fallback visibly off-asset (ADR-0003). |
| Plan streaming for very large sets | ADR-0001 accepts full-plan-in-memory; revisit past ~50k tokens. |
| Wizard lifecycle as one discriminated union (§7.8) | Real, but cosmetic next to §3 and §4. Fold into M6 only if the file is being touched anyway. |
| Settings sub-system simplification (§7.7) | ~59 lines per persisted field for one subscriber. Revisit **after** M3, which adds credentials to the same store and may change the calculus. |

---

## 8. Out of scope

Permanent non-goals ([constitution.md](constitution.md) §1). Requests
here get a one-line refusal from the PO, not a backlog entry: token
editing inside Figma, round-trip authoring, cloud sync, hosted
backends, telemetry, Style Dictionary or CSS export, and token formats
other than DTCG · 2025.10 (ADR-0005).

---

## 9. Moving an item

- **Into a ratified milestone** — PO edits
  [constitution.md](constitution.md) §2, one PR, reason in the commit
  message. Then update the status table here.
- **Proposed → ratified** — same, plus entry and exit criteria that
  name the artifacts proving them.
- **A requirement changes** — edit
  [requirements/feature-requirements.md](requirements/feature-requirements.md);
  if user intent changed, edit [requirements/req-0001.md](requirements/req-0001.md)
  and keep it short.
- **An architectural decision changes** — new ADR referencing the old,
  old one flipped to `superseded by`. ADRs are append-only
  ([decisions/README.md](decisions/README.md)).

Every change still clears the four Definition-of-Done gates in
[constitution.md](constitution.md) §3.5: fixture tests pass, UX has
signed off visually, the change advances the current milestone without
adding non-goal scope, and no undocumented entry lands in
[../docs/spec-deviations.md](../docs/spec-deviations.md).
