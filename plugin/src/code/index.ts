import { mergeWithDefaults, type VariablePlan } from "../shared/mapping/toFigma.js";
import { write } from "../shared/writer/variableWriter.js";
import { createFigmaApiLive } from "./figmaApiLive.js";
import type { StoredSettings, ToCode, ToUI } from "./messages.js";

const SETTINGS_KEY = "nidle.settings.v1";
// Pre-rename installs stored under the old project name; migrated on read.
const LEGACY_SETTINGS_KEY = "boppli.settings.v1";

figma.showUI(__html__, { width: 480, height: 668, themeColors: true });

figma.ui.onmessage = (msg: ToCode) => {
  if (msg.type === "close") {
    figma.closePlugin();
    return;
  }
  if (msg.type === "readSettings") {
    void readSettings();
    return;
  }
  if (msg.type === "writeSettings") {
    void writeSettings(msg.settings);
    return;
  }
  if (msg.type === "applyPlan") {
    void applyPlan(msg.plan);
  }
};

async function applyPlan(plan: VariablePlan): Promise<void> {
  try {
    const api = await createFigmaApiLive();
    const report = await write(plan, api, {
      onProgress: (p) => post({ type: "progress", ...p }),
    });
    post({ type: "done", ...report });
  } catch (e) {
    post({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function post(msg: ToUI): void {
  figma.ui.postMessage(msg);
}

async function readSettings(): Promise<void> {
  let raw = await figma.clientStorage.getAsync(SETTINGS_KEY);
  if (raw === undefined) {
    raw = await figma.clientStorage.getAsync(LEGACY_SETTINGS_KEY);
    if (raw !== undefined) {
      await figma.clientStorage.setAsync(SETTINGS_KEY, raw);
      await figma.clientStorage.deleteAsync(LEGACY_SETTINGS_KEY);
    }
  }
  // Same whitelist as the UI side — corrupt stored values fall back to
  // their defaults before they ever cross the boundary (FR-906).
  const settings: StoredSettings = mergeWithDefaults(raw);
  post({ type: "settings", settings });
}

async function writeSettings(settings: StoredSettings): Promise<void> {
  await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
}
