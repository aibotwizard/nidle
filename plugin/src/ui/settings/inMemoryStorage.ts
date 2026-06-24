import type { SettingsStorage, StoredSettings } from "./types.js";

/**
 * In-memory SettingsStorage adapter. Useful for unit-testing the
 * SettingsStore without a postMessage transport.
 */
export function createInMemoryStorage(
  initial: StoredSettings = {},
): SettingsStorage & { peek(): StoredSettings } {
  let state: StoredSettings = { ...initial };
  return {
    load: async () => ({ ...state }),
    save: async (settings) => {
      state = { ...settings };
    },
    peek: () => ({ ...state }),
  };
}
