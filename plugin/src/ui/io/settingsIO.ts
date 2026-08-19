import type { StoredSettings } from "../../code/messages.js";
import type { SandboxTransport } from "./transport.js";

export type { StoredSettings };
// The validator lives in shared/ so the sandbox applies the same
// whitelist on its side of the boundary (req-0002 / FR-906).
export { mergeWithDefaults } from "../../shared/mapping/toFigma.js";

/**
 * Single-purpose port for persisting StoredSettings. The live adapter
 * round-trips through postMessage to figma.clientStorage; the in-memory
 * adapter is for tests.
 */
export type SettingsStorage = {
  load(): Promise<StoredSettings>;
  save(settings: StoredSettings): Promise<void>;
};

/** A silent sandbox must not leave the UI waiting forever on boot. */
const LOAD_TIMEOUT_MS = 2000;

/**
 * SettingsStorage adapter over the UI ↔ sandbox postMessage channel.
 * `load()` resolves when the sandbox answers with a `settings` message,
 * or with `{}` after LOAD_TIMEOUT_MS so the UI falls back to defaults.
 * `save()` resolves immediately (the sandbox's write is fire-and-forget;
 * the next `load()` will see it).
 */
export function createPostMessageStorage(
  transport: SandboxTransport,
): SettingsStorage {
  return {
    load: () =>
      new Promise<StoredSettings>((resolve) => {
        const settle = (v: StoredSettings) => {
          clearTimeout(timer);
          unsubscribe();
          resolve(v);
        };
        const unsubscribe = transport.addMessageListener((msg) => {
          if (msg.type === "settings") settle(msg.settings);
        });
        const timer = setTimeout(() => settle({}), LOAD_TIMEOUT_MS);
        transport.postCode({ type: "readSettings" });
      }),
    save: async (settings) => {
      transport.postCode({ type: "writeSettings", settings });
    },
  };
}

/** In-memory SettingsStorage adapter for tests. */
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
