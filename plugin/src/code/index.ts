import type { VariablePlan } from "../shared/mapping/toFigma.js";
import { write } from "../shared/writer/variableWriter.js";
import { createFigmaApiLive } from "./figmaApiLive.js";
import type { StoredSettings, ToCode, ToUI } from "./messages.js";

const SETTINGS_KEY = "boppli.settings.v1";

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
  const raw = await figma.clientStorage.getAsync(SETTINGS_KEY);
  const settings: StoredSettings =
    raw && typeof raw === "object" ? (raw as StoredSettings) : {};
  post({ type: "settings", settings });
}

async function writeSettings(settings: StoredSettings): Promise<void> {
  await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
}
