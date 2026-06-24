import {
  DEFAULT_SETTINGS,
  type MappingSettings,
} from "../../shared/mapping/toFigma.js";
import type { StoredSettings } from "./types.js";

/**
 * Merge a stored payload (possibly partial, possibly stale) with the
 * current defaults, dropping unknown values. This is the single point of
 * trust for what a valid `MappingSettings` looks like.
 */
export function mergeWithDefaults(raw: StoredSettings | unknown): MappingSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const r = raw as StoredSettings;
  return {
    refMode: r.refMode === "resolve" ? "resolve" : "keepAlias",
    separator: r.separator === "dot" ? "dot" : "slash",
    updateExisting:
      typeof r.updateExisting === "boolean"
        ? r.updateExisting
        : DEFAULT_SETTINGS.updateExisting,
  };
}
