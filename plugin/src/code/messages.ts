import type { VariablePlan } from "../shared/mapping/toFigma.js";
import type { LogTone, WriteError } from "../shared/writer/types.js";

/**
 * Wire-level shape of a per-token error. Matches WriteError exactly —
 * the alias keeps the message type self-documenting at the boundary.
 */
export type PlanError = WriteError;

/**
 * Persisted settings payload. Defined here (not imported from
 * ui/settings/types) so the sandbox doesn't need to know about UI-side
 * modules.
 */
export type StoredSettings = Partial<
  import("../shared/mapping/toFigma.js").MappingSettings
>;

export type ToCode =
  | { type: "applyPlan"; plan: VariablePlan }
  | { type: "readSettings" }
  | { type: "writeSettings"; settings: StoredSettings }
  | { type: "close" };

export type ToUI =
  | { type: "progress"; pct: number; line: string; tone: LogTone }
  | {
      type: "done";
      created: number;
      updated: number;
      errors: PlanError[];
    }
  | { type: "error"; message: string }
  | { type: "settings"; settings: StoredSettings };

export type { LogTone } from "../shared/writer/types.js";
