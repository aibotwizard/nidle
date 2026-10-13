import type { ParseWarning, Token } from "../../shared/dtcg/types.js";
import type { LogTone, PlanError, StoredSettings, ToUI } from "../../code/messages.js";
import type { MappingSettings } from "../../shared/settings/types.js";
import type { FileTokens } from "../../shared/intake/types.js";

export type Step = 1 | 2 | 3 | 4;

export type FileMeta = {
  path: string;
  name: string;
  folder: string;
  tokens: Token[];
  selected: boolean;
};

export type LogLine = { text: string; tone: LogTone };

export type ImportResult = {
  created: number;
  updated: number;
  errors: PlanError[];
};

/**
 * The wizard lifecycle as a discriminated union — `importing && done`
 * and friends are unrepresentable. A sandbox error lands on `done`
 * without a result; the log carries the error line.
 */
export type Phase =
  | { kind: "source" }
  | { kind: "sets" }
  | { kind: "preview" }
  | { kind: "importing"; progress: number }
  | { kind: "done"; result?: ImportResult };

/** The two phases Step 4 renders. */
export type ImportPhase = Extract<Phase, { kind: "importing" | "done" }>;

export type State = {
  phase: Phase;
  files: FileMeta[];
  log: LogLine[];
  // Parse-stage warnings from the last upload, unreadable files included;
  // `diagnose` decides which of them count and how they render.
  parseWarnings: ParseWarning[];
  settings: MappingSettings;
  settingsOpen: boolean;
};

/**
 * Sandbox messages ARE actions — `ToUI` folds straight into the union,
 * so the transport listener is just `addMessageListener(dispatch)`.
 */
export type Action =
  | ToUI
  | { type: "filesLoaded"; files: FileTokens[]; parseWarnings: ParseWarning[] }
  | { type: "fileToggled"; path: string }
  | { type: "navigated"; to: 1 | 2 | 3 }
  | { type: "importStarted"; count: number; consoleLines: LogLine[] }
  | { type: "settingsChanged"; patch: StoredSettings }
  | { type: "sheetToggled"; open: boolean }
  | { type: "reset" };

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
