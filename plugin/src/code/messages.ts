import type { MappingSettings, VariablePlan } from "../shared/mapping/toFigma.js";

export type PlanError = {
  variable: string;
  reason: string;
  source: { file: string; path: string };
};

export type StoredSettings = Partial<MappingSettings>;

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

export type LogTone = "dim" | "plain" | "accent" | "ok" | "err";
