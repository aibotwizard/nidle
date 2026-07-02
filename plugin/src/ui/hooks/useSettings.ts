import { useSyncExternalStore } from "react";
import type { MappingSettings } from "../../shared/mapping/toFigma.js";
import type { SettingsStore } from "../settings/types.js";

/**
 * Subscribe a component to the settings store. Relies on the store
 * contract that `get()` returns the same object reference between
 * broadcasts — if `get` ever computes a fresh snapshot, React will
 * throw "getSnapshot should be cached".
 */
export function useSettings(store: SettingsStore): MappingSettings {
  return useSyncExternalStore(store.subscribe, store.get);
}
