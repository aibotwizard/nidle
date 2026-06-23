import type { VariablePlan } from "../shared/mapping/toFigma.js";

export type PlanError = {
  variable: string;
  reason: string;
  source: { file: string; path: string };
};

export type ToCode =
  | { type: "applyPlan"; plan: VariablePlan }
  | { type: "close" };

export type ToUI =
  | { type: "progress"; pct: number; line: string; tone: LogTone }
  | { type: "done"; created: number; errors: PlanError[] }
  | { type: "error"; message: string };

export type LogTone = "dim" | "plain" | "accent" | "ok" | "err";
