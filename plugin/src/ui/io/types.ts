import type { StoredSettings, ToCode, ToUI } from "../../code/messages.js";
import type { ParseWarning } from "../../shared/dtcg/types.js";
import type { RawUpload } from "../../shared/intake/types.js";

export type ToUIHandler = (msg: ToUI) => void;

/**
 * Two-way bus between the UI and the sandbox, and the sole owner of the
 * iframe's `window.message` listener. Subscribers each get every message
 * until they unsubscribe.
 */
export type SandboxTransport = {
  postCode(msg: ToCode): void;
  addMessageListener(handler: ToUIHandler): () => void;
};

/**
 * Single-purpose port for persisting StoredSettings. The live adapter
 * round-trips through postMessage to figma.clientStorage; the in-memory
 * adapter is for tests.
 */
export type SettingsStorage = {
  load(): Promise<StoredSettings>;
  save(settings: StoredSettings): Promise<void>;
};

export type IntakeFiles = {
  uploads: RawUpload[];
  /** Unreadable files: every token in them is lost, so error-level. */
  warnings: ParseWarning[];
};
