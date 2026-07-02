import type { Token } from "../../shared/dtcg/types.js";
import type { LogTone, PlanError } from "../../code/messages.js";

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

export type State = {
  step: Step;
  files: FileMeta[];
  settingsOpen: boolean;
  importing: boolean;
  done: boolean;
  progress: number;
  log: LogLine[];
  result?: ImportResult;
};

export const initialState: State = {
  step: 1,
  files: [],
  settingsOpen: false,
  importing: false,
  done: false,
  progress: 0,
  log: [],
};

export type Action =
  | { type: "filesLoaded"; files: FileMeta[]; warningLines: LogLine[] }
  | { type: "fileToggled"; path: string }
  | { type: "stepChanged"; step: Step }
  | { type: "settingsOpened" }
  | { type: "settingsClosed" }
  | { type: "importStarted"; count: number }
  | { type: "importBlockedEmpty" }
  | { type: "progressReceived"; pct: number; line: string; tone: LogTone }
  | { type: "doneReceived"; created: number; updated: number; errors: PlanError[] }
  | { type: "errorReceived"; message: string }
  | { type: "reset" };

// Only this many per-token errors are echoed to the console; the full
// list still lands in `result.errors` for the Step 4 stats.
const ERROR_PREVIEW = 12;

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "filesLoaded":
      return { ...state, files: action.files, log: [...state.log, ...action.warningLines] };
    case "fileToggled":
      return {
        ...state,
        files: state.files.map((f) =>
          f.path === action.path ? { ...f, selected: !f.selected } : f,
        ),
      };
    case "stepChanged":
      return { ...state, step: action.step };
    case "settingsOpened":
      return { ...state, settingsOpen: true };
    case "settingsClosed":
      return { ...state, settingsOpen: false };
    case "importStarted":
      return {
        ...state,
        step: 4,
        importing: true,
        done: false,
        progress: 0,
        log: [{ text: `Sending ${action.count} variables to Figma…`, tone: "dim" }],
      };
    case "importBlockedEmpty":
      return {
        ...state,
        step: 4,
        importing: false,
        done: true,
        progress: 0,
        log: [...state.log, { text: "No tokens to import.", tone: "err" }],
        result: { created: 0, updated: 0, errors: [] },
      };
    case "progressReceived":
      return {
        ...state,
        progress: action.pct,
        log: [...state.log, { text: action.line, tone: action.tone }],
      };
    case "doneReceived": {
      const lines: LogLine[] = action.errors
        .slice(0, ERROR_PREVIEW)
        .map((err) => ({
          text: `${err.source.file} · ${err.variable} — ${err.reason}`,
          tone: "err" as const,
        }));
      if (action.errors.length > ERROR_PREVIEW) {
        lines.push({ text: `…and ${action.errors.length - ERROR_PREVIEW} more`, tone: "err" });
      }
      lines.push({
        text:
          `✓ Imported ${action.created} created, ${action.updated} updated` +
          (action.errors.length ? ` (${action.errors.length} errors)` : ""),
        tone: action.errors.length ? "err" : "ok",
      });
      return {
        ...state,
        importing: false,
        done: true,
        progress: 100,
        log: [...state.log, ...lines],
        result: { created: action.created, updated: action.updated, errors: action.errors },
      };
    }
    case "errorReceived":
      return {
        ...state,
        importing: false,
        done: true,
        log: [...state.log, { text: `Error: ${action.message}`, tone: "err" }],
      };
    case "reset":
      return initialState;
  }
}
