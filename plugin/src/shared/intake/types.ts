import type { ParseWarning, Token } from "../dtcg/types.js";
import type { FileTokens } from "../mapping/toFigma.js";

/**
 * One source file's raw, parsed-but-unprocessed contents. Used as the
 * input to TokenIntake.
 */
export type RawUpload = {
  /** Relative path from the upload root, e.g. "core/color.json". */
  path: string;
  /** Parsed JSON contents. */
  json: unknown;
};

/**
 * What TokenIntake produces. `files` is what the planner wants;
 * `warnings` is every parse-stage warning for them (ADR-0022 decides
 * how they are shown).
 */
export type IntakeResult = {
  files: FileTokens[];
  warnings: ParseWarning[];
};

export type { FileTokens, Token };
