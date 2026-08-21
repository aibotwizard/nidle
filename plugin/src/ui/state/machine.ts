import type { Token } from "../../shared/dtcg/types.js";
import type { LogTone, PlanError, StoredSettings, ToUI } from "../../code/messages.js";
import {
  DEFAULT_SETTINGS,
  type MappingSettings,
} from "../../shared/mapping/toFigma.js";
// Pure validator only — no I/O crosses this import.
import { mergeWithDefaults } from "../io/settingsIO.js";

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

export type State = {
  phase: Phase;
  files: FileMeta[];
  log: LogLine[];
  // Parse-time warnings from the last upload; seeded into the log when an
  // import starts so they stay visible on the Step 4 console.
  intakeWarnings: LogLine[];
  settings: MappingSettings;
  settingsOpen: boolean;
};

export const initialState: State = {
  phase: { kind: "source" },
  files: [],
  log: [],
  intakeWarnings: [],
  settings: { ...DEFAULT_SETTINGS },
  settingsOpen: false,
};

/**
 * Sandbox messages ARE actions — `ToUI` folds straight into the union,
 * so the transport listener is just `addMessageListener(dispatch)`.
 */
export type Action =
  | ToUI
  | { type: "filesLoaded"; files: FileMeta[]; warningLines: LogLine[] }
  | { type: "fileToggled"; path: string }
  | { type: "navigated"; to: 1 | 2 | 3 }
  | { type: "importStarted"; count: number }
  | { type: "settingsChanged"; patch: StoredSettings }
  | { type: "sheetToggled"; open: boolean }
  | { type: "reset" };

export function stepOf(phase: Phase): Step {
  switch (phase.kind) {
    case "source":
      return 1;
    case "sets":
      return 2;
    case "preview":
      return 3;
    default:
      return 4;
  }
}

const NAV_PHASE: Record<1 | 2 | 3, Phase> = {
  1: { kind: "source" },
  2: { kind: "sets" },
  3: { kind: "preview" },
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "filesLoaded":
      return { ...state, files: action.files, intakeWarnings: action.warningLines };
    case "fileToggled":
      return {
        ...state,
        files: state.files.map((f) =>
          f.path === action.path ? { ...f, selected: !f.selected } : f,
        ),
      };
    case "navigated":
      return { ...state, phase: NAV_PHASE[action.to] };
    case "importStarted":
      return {
        ...state,
        phase: { kind: "importing", progress: 0 },
        log: [
          ...state.intakeWarnings,
          { text: `Sending ${action.count} variables to Figma…`, tone: "dim" },
        ],
      };
    case "progress":
      if (state.phase.kind !== "importing") return state;
      return {
        ...state,
        phase: { kind: "importing", progress: action.pct },
        log: [...state.log, { text: action.line, tone: action.tone }],
      };
    case "done": {
      // Every error is echoed — the console scrolls, and hiding errors
      // behind a "…and N more" line proved unacceptable in acceptance
      // testing (ADR-0017).
      const lines: LogLine[] = action.errors.map((err) => ({
        text: `${err.source.file} · ${err.variable} — ${err.reason}`,
        tone: "err" as const,
      }));
      lines.push({
        text:
          `✓ Imported ${action.created} created, ${action.updated} updated` +
          (action.errors.length ? ` (${action.errors.length} errors)` : ""),
        tone: action.errors.length ? "err" : "ok",
      });
      return {
        ...state,
        phase: {
          kind: "done",
          result: { created: action.created, updated: action.updated, errors: action.errors },
        },
        log: [...state.log, ...lines],
      };
    }
    case "error":
      return {
        ...state,
        phase: { kind: "done" },
        log: [...state.log, { text: `Error: ${action.message}`, tone: "err" }],
      };
    case "settings":
      return { ...state, settings: mergeWithDefaults({ ...state.settings, ...action.settings }) };
    case "settingsChanged":
      return { ...state, settings: mergeWithDefaults({ ...state.settings, ...action.patch }) };
    case "sheetToggled":
      return { ...state, settingsOpen: action.open };
    case "reset":
      // Settings are persisted user preferences — they survive the reset.
      return { ...initialState, settings: state.settings };
  }
}
