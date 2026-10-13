import type { MappingSettings } from "./types.js";

export const DEFAULT_SETTINGS: MappingSettings = {
  refMode: "keepAlias",
  separator: "slash",
  updateExisting: true,
};

/**
 * Merge a stored payload (possibly partial, possibly stale, possibly
 * corrupt) with the defaults, dropping unknown values. The single point
 * of trust for what a valid `MappingSettings` looks like — used on BOTH
 * sides of the postMessage boundary (req-0002 / FR-906).
 */
export function mergeWithDefaults(raw: unknown): MappingSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const r = raw as Partial<MappingSettings>;
  return {
    refMode: r.refMode === "resolve" ? "resolve" : "keepAlias",
    separator: r.separator === "dot" ? "dot" : "slash",
    updateExisting:
      typeof r.updateExisting === "boolean"
        ? r.updateExisting
        : DEFAULT_SETTINGS.updateExisting,
  };
}
