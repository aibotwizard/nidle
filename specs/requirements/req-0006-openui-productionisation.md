# REQ-0006 — OpenUI productionisation (Jira follow-up)

- **Status:** delivered in code (2026-08-19) except the items outside
  this repository — see disposition table
- **Source:** Jira follow-up to ticket ~~OUI-3990~~ "Evaluation Figma
  Plugin" (screenshot provided by the user, transcribed below)
- **Raised by:** OpenUI design-system team
- **Related:** ADR-0014 (semantic split), ADR-0004 (upsert),
  [../specification.md](../specification.md) §4.3.2a

## Ticket transcription (German original, condensed)

> Das Figma Plugin zur Synchronisierung von Design-Tokens (Ticket
> ~~OUI-3990~~) funktioniert schon sehr weit! Es gibt aber noch ein
> paar offene Punkte, bevor es für uns produktiv nutzbar ist:
>
> **AC 1 — Umbau Figma Plugin (GitHub Projekt Nidle)**
> 1. Semantic Collection soll neu aufgeteilt werden in 2 Collections:
>    "Semantic-Color-Scheme" mit den Modes Light/Dark (Default Light);
>    "Semantic-Appearance" mit den Modes Desktop/Tablet (Default
>    Desktop).
> 2. Optional: Dynamische Aufteilung je nach benötigtem Modi-Switcher,
>    je nach eingefütterten Daten. Optional, da OpenUI
>    Design-Token-Struktur bereits feststeht.
> 3. Plugin soll sowohl "components" als auch "component" als
>    Foldername akzeptieren und sie auf die Collection "Component"
>    mappen.
> 4. Entfernung aller Spuren von "Boppli", einer Altlast des vorherigen
>    Projektnamens.
>
> **AC 2 — Umbau Design-Tokens:** Anpassung aller `$type` Angaben (noch
> nicht W3C-konform); danach sollten sie sich in Figma überführen
> lassen.
> **AC 3:** Figma: Test und Ausführung in Figma im File "Test".
> **AC 4:** Optional: weitere offene Punkte in einem nächsten Jira-Task.
> **AC 5:** DoD erfüllt.

## Disposition

| AC | What | Where it landed |
|----|------|-----------------|
| 1.1 | Split Semantic into `Semantic-Color-Scheme` (Light/Dark, default Light) and `Semantic-Appearance` (Desktop/Tablet, default Desktop) | **Done** — ADR-0014; `SEMANTIC_SPLITS` in `mapping/toFigma.ts`; pinned by `tests/toFigma.spec.ts > semantic split` and `variableWriter.spec.ts` |
| 1.2 | *(Optional)* dynamic split per mode switcher | **Done** — the same mechanism generalises: any other themed group becomes `Semantic-<Dir>`; the two named splits are recognitions by mode set, not special cases |
| 1.3 | Accept `component` and `components` folder names | **Done** — both route to the **Components** collection (see deviation note below) |
| 1.4 | Remove all traces of "Boppli" | **Done** — README, `package.json`, specs renamed to Nidle; `clientStorage` key is now `nidle.settings.v1`, with a one-time read migration from the legacy `boppli.settings.v1` so existing installs keep their settings |
| 2 | Fix `$type` values in the token files | **Out of this repo** — the tokens live in the OpenUI token repository. Plugin-side, unsupported `$type`s already warn per token (FR-205), which is the tool for finding them |
| 3 | Test in Figma file "Test" | **Manual** — needs a live Figma session; the in-repo gate (110 tests incl. fixture + writer coverage) is green |
| 4, 5 | Follow-up task, DoD | Process items for the team |

## Deviations from the ticket text

1. **Collection name stays `Components` (plural), not `Component`.**
   The ticket says "auf die Collection 'Component' mappen". Renaming
   the collection would break the `(collection, name)` upsert match
   (ADR-0004) for every existing variable in already-imported files —
   a re-import would duplicate the entire Components collection. Both
   folder spellings are accepted; the collection keeps its shipped
   name. Flag in the next Jira task if the rename is genuinely wanted.
2. **Constitution wording.** Constitution §2 (M4) still says
   "three-collection layout". The split makes the collection count
   data-driven. Amending the constitution is PO-only — this needs a
   one-line PO amendment referencing ADR-0014.

## Acceptance criteria (this repo)

1. A themed semantic group {light, dark} plans as collection
   `Semantic-Color-Scheme` with modes exactly `[Light, Dark]`. ✅
2. A themed semantic group {desktop, tablet} plans as
   `Semantic-Appearance` with modes exactly `[Desktop, Tablet]`. ✅
3. Any other themed semantic group plans as `Semantic-<Dir>`;
   non-themed semantic files stay in `Semantic`. ✅
4. Alias targets name the final (split) collection. ✅
5. `component/` and `components/` both route to Components. ✅
6. No `boppli` string remains outside legacy-migration code; stored
   settings survive the key rename. ✅
