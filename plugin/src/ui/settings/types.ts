import type { MappingSettings } from "../../shared/mapping/toFigma.js";
import type { StoredSettings } from "../../code/messages.js";

export type { StoredSettings };

/**
 * Single-purpose port for persisting StoredSettings. The live adapter
 * round-trips through postMessage to figma.clientStorage; the in-memory
 * adapter is for tests.
 */
export type SettingsStorage = {
  load(): Promise<StoredSettings>;
  save(settings: StoredSettings): Promise<void>;
};

export type SettingsListener = (settings: MappingSettings) => void;

export type SettingsUnsubscribe = () => void;

/**
 * The deep settings module. UI code only sees `get / update / subscribe` —
 * defaults, validation, persistence, and change broadcasting live inside.
 */
export type SettingsStore = {
  get(): MappingSettings;
  update(patch: Partial<MappingSettings>): void;
  subscribe(listener: SettingsListener): SettingsUnsubscribe;
};
