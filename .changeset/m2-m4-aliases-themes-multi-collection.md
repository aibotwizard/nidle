---
"tokens-to-variables": minor
---

Add M2 (aliases & themes) and M4 (multi-collection layout & update semantics) on top of the M1 walking skeleton.

**Aliases.** DTCG aliases like `{color.blue.500}` resolve across all uploaded files. The new **Reference handling** setting toggles between *Keep as alias* (Figma variable-to-variable edges that preserve the author's direct hop — see ADR-0009) and *Resolve to raw value* (substitute the chain-tip literal). The resolver detects cycles, missing targets, and type mismatches; each one surfaces as a per-token warning rather than a silent drop.

**Themes → modes.** Sibling files in the same directory whose `(name, type)` shapes match are folded into one collection with one mode per file. `semantic/light.json` + `semantic/dark.json` produce a `Semantic` collection with `Light` and `Dark` modes, and alias edges are written per mode.

**Three-collection layout.** Folder convention drives bucketing: `core/*` → **Primitives**, `semantic/*` → **Semantic**, `components/*` → **Components**. Unknown top-level folders fall back to Primitives with a warning. Flat single-file uploads stay in Primitives silently (preserving M1 behaviour).

**Group separator + update-existing toggle.** Variable names emit with `/` or `.` between groups. The *Update existing variables* toggle matches by `(collection, name)` and overwrites in place; when off, existing variables are preserved and the skip is logged per token.

**Settings sheet.** Gear icon opens a sheet with reference handling, separator, update-existing, and a read-only theme→mode mapping. All three settings persist in `figma.clientStorage` via a new `readSettings`/`writeSettings` message pair, and reload on plugin boot.

**M5 polish items.** Streaming progress, per-token error reporting with `(file, path, reason)` provenance, and settings persistence all shipped incidentally — the M1 architecture already supplied the underlying mechanics.

**Internals.** `applyPlan` refactored into `setupCollections` / `materializeVariables` / `writeValues`. `getLocalVariables()` and `getLocalVariableCollections()` are each snapshotted once rather than scanned per plan collection (fixes an N+1 against the file's variable count). The UI memoises `computePlan()` per `(selectedFiles, settings)` so Step 3, the footer label, and the settings sheet share one planner run per render. `appendLog` uses in-place push instead of spread (no more O(n²) growth during long imports). File reads batch via `Promise.all` then a single `parseFiles` call. Settings sheet drives off `plan.themeGroups` instead of re-implementing folder/dir bucketing.

**Tests.** New `tests/resolve.spec.ts` and `tests/toFigma.spec.ts` plus fixtures `m2-aliases-themes/` and `m4-multi-collection/`. 31/31 green.

**Specs.** plan.md §0/§2/§3/§4/§5 synced to what shipped, constitution.md M2/M4/M5 marked `[implemented]`, new ADR-0009 documenting why `keepAlias` preserves the author's direct hop rather than collapsing chains to the literal-bearing tip.
