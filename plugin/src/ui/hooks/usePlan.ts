import { useMemo } from "react";
import {
  planForFiles,
  type FileTokens,
  type MappingSettings,
  type VariablePlan,
} from "../../shared/mapping/toFigma.js";
import type { FileMeta } from "../state/appState.js";

/**
 * Plan for the currently selected files. The reducer replaces `files`
 * on every selection change and the store replaces `settings` on every
 * update, so object identity is an exact invalidation key.
 */
export function usePlan(files: FileMeta[], settings: MappingSettings): VariablePlan {
  return useMemo(() => {
    const fts: FileTokens[] = files
      .filter((f) => f.selected)
      .map((f) => ({ file: f.path, tokens: f.tokens }));
    return planForFiles(fts, settings);
  }, [files, settings]);
}
