import type { SandboxTransport } from "../transport/types.js";
import type { SettingsStorage, StoredSettings } from "./types.js";

/**
 * SettingsStorage adapter that round-trips through the UI ↔ sandbox
 * postMessage channel. `load()` resolves when the sandbox answers with a
 * `settings` message. `save()` resolves immediately (the sandbox's write
 * is fire-and-forget; the next `load()` will see it).
 */
export function createPostMessageStorage(
  transport: SandboxTransport,
): SettingsStorage {
  return {
    load: () =>
      new Promise<StoredSettings>((resolve) => {
        const unsubscribe = transport.addMessageListener((msg) => {
          if (msg.type !== "settings") return;
          unsubscribe();
          resolve(msg.settings);
        });
        transport.postCode({ type: "readSettings" });
      }),
    save: async (settings) => {
      transport.postCode({ type: "writeSettings", settings });
    },
  };
}
