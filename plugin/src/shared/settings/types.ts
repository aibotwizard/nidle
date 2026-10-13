import type { ResolveMode } from "../dtcg/types.js";

/**
 * The user-facing import settings — what the settings sheet edits, what
 * `clientStorage` persists, and what the plan stage reads. Shared by the
 * UI and the sandbox, so both sides validate with the same whitelist.
 */
export type Separator = "slash" | "dot";

export type MappingSettings = {
  refMode: ResolveMode;
  separator: Separator;
  updateExisting: boolean;
};
