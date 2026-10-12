# ADR 0022 — One module owns how warnings are presented

- **Status:** accepted
- **Date:** 2026-10-13
- **Deciders:** AO (module ownership), UX (no visual change)
- **Related:** ADR-0020 (warning severity split), ADR-0017 (visible parse
  errors), [constitution.md](../constitution.md) §3.2,
  [architecture.md](../architecture.md) §3.3

## Context

ADR-0020 gave `ParseWarning` a severity and promised three views of it:
per-token drops and grouped notices on Step 3, per-token detail on the
Step 4 console, and an error count on the Step 4 stats. No module owned
that promise. `App.tsx`, `StepPreview.tsx` and the reducer each re-derived
"which warnings, at what severity, for which files", in two encodings
(`level` on `ParseWarning`, `tone` on pre-rendered `LogLine`s kept in a
second copy of the same warnings in `State`). They disagreed, and two
ADR-0020 promises were broken:

1. **Plan-stage warnings never reached the console.** The log was seeded
   from parse-stage lines only, so theme-fill notices, type conflicts and
   unresolved aliases appeared on Step 3 alone — under a panel line
   reading "Per-token detail in the import console."
2. **The Tokens Studio expansion notice never reached Step 3.** It is filed
   under the combined upload's path; the Step 3 filter kept only warnings
   whose file was a *selected set*, which that path never is.

Unreadable JSON was also missing from Step 3, and the Step 4 stat counted
deselected files' warnings while Step 3 did not.

## Decision

1. **`ui/state/diagnostics.ts` owns warning presentation.**
   `diagnose(parseWarnings, planWarnings, files)` returns `dropped`
   (error-level, per token), `notices` (one line per kind, most frequent
   first) and `consoleLines` (every counted warning, per token). Step 3,
   the console seed and the Step 4 stat read from it and nothing else.
2. **One scoping rule:** a warning counts unless its file is a loaded file
   the user deselected. Upload-level warnings — unreadable files, the
   Tokens Studio expansion notice — name no loaded file and always count.
   Plan warnings are computed from the selection and always count.
3. **One encoding.** Unreadable files become error-level `ParseWarning`s at
   intake (`path: "(root)"`); `State.intakeWarnings` is deleted. The
   console line format is uniform: `file · path — reason`.
4. `ParseWarning.summary` stays where ADR-0020 put it; only its readers
   moved.

## Consequences

- The console now carries every plan-stage warning, per token, so the
  Step 3 notice panel's promise holds.
- Step 3 shows the Tokens Studio notice and unreadable files.
- The Step 4 "parse warnings" stat equals the Step 3 drop count.
- Severity, scoping and grouping are pinned in node by
  `tests/ui/diagnostics.spec.ts`; the three regressions are pinned
  end to end in `tests/ui/appFlow.spec.tsx`.
- An invalid-JSON console line now reads `core/x.json · (root) — invalid
  JSON…` instead of `core/x.json — invalid JSON…`.
- No visual change: the panels' markup and classes are unchanged.
