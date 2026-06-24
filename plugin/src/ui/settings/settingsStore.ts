import {
  DEFAULT_SETTINGS,
  type MappingSettings,
} from "../../shared/mapping/toFigma.js";
import { mergeWithDefaults } from "./validate.js";
import type {
  SettingsListener,
  SettingsStorage,
  SettingsStore,
  SettingsUnsubscribe,
} from "./types.js";

/**
 * Build a SettingsStore over a storage adapter. The store:
 *
 * - holds the current merged settings in memory,
 * - broadcasts to subscribers on every update,
 * - persists asynchronously through the adapter (fire-and-forget; the
 *   in-memory state is the source of truth during the session).
 *
 * Call `hydrateFrom(raw)` when the adapter delivers the initial load.
 */
export function createSettingsStore(
  storage: SettingsStorage,
): SettingsStore & { hydrateFrom(raw: unknown): void } {
  let current: MappingSettings = { ...DEFAULT_SETTINGS };
  const listeners = new Set<SettingsListener>();

  const broadcast = () => {
    for (const l of listeners) l(current);
  };

  void storage.load().then((raw) => {
    current = mergeWithDefaults(raw);
    broadcast();
  });

  return {
    get: () => current,
    update: (patch) => {
      current = mergeWithDefaults({ ...current, ...patch });
      broadcast();
      void storage.save(current);
    },
    subscribe: (listener: SettingsListener): SettingsUnsubscribe => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrateFrom: (raw) => {
      current = mergeWithDefaults(raw);
      broadcast();
    },
  };
}
