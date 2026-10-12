import type { ParseWarning } from "../../shared/dtcg/types.js";
import type { LogLine } from "./machine.js";

/**
 * What the user is told about everything the import converts or loses —
 * the single owner of severity, file scope and grouping for every stage's
 * warnings (ADR-0022). Step 3, the Step 4 console and the Step 4 stat all
 * read from here, so they cannot disagree.
 */
export type Diagnostics = {
  /** Error-level: the import loses these. Listed per token on Step 3. */
  dropped: ParseWarning[];
  /** Notices collapsed to one line per kind, most frequent first. */
  notices: { kind: string; count: number }[];
  /** Every counted warning, per token — the Step 4 console seed. */
  consoleLines: LogLine[];
};

/** The one per-token line format: Step 3 and the console render the same text. */
export const warningLine = (w: ParseWarning): string => `${w.file} · ${w.path} — ${w.reason}`;

/**
 * A warning counts when its file is selected, or when it names no loaded
 * file at all — an unreadable upload, or a Tokens Studio export whose
 * notice is filed under the combined file rather than its expanded sets.
 * Plan warnings are computed from the selection already, so they all count.
 */
export function diagnose(
  parseWarnings: ParseWarning[],
  planWarnings: ParseWarning[],
  files: { path: string; selected: boolean }[],
): Diagnostics {
  const deselected = new Set(files.filter((f) => !f.selected).map((f) => f.path));
  const counted = [...parseWarnings.filter((w) => !deselected.has(w.file)), ...planWarnings];

  const byKind = new Map<string, number>();
  for (const w of counted) {
    if (w.level !== "notice") continue;
    const kind = w.summary ?? w.reason;
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  }

  return {
    dropped: counted.filter((w) => w.level !== "notice"),
    notices: [...byKind]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
    consoleLines: counted.map((w) => ({
      text: warningLine(w),
      tone: w.level === "notice" ? "dim" : "err",
    })),
  };
}
