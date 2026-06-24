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
 * What TokenIntake produces. `files` is what the planner wants; the
 * other two fields surface problems the UI can show on Step 1 (parse
 * warnings) or Step 2 (failures).
 */
export type IntakeResult = {
  files: FileTokens[];
  warnings: ParseWarning[];
  parseFailures: { path: string; reason: string }[];
};

export type { FileTokens, Token };
