import { hexToRgba } from "../shared/dtcg/parse.js";
import type { VariableOp, VariablePlan } from "../shared/mapping/toFigma.js";
import type { PlanError, ToCode, ToUI } from "./messages.js";

figma.showUI(__html__, { width: 480, height: 668, themeColors: true });

figma.ui.onmessage = (msg: ToCode) => {
  if (msg.type === "close") {
    figma.closePlugin();
    return;
  }
  if (msg.type === "applyPlan") {
    applyPlan(msg.plan).catch((e) => {
      const err: ToUI = {
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      };
      figma.ui.postMessage(err);
    });
  }
};

function post(msg: ToUI): void {
  figma.ui.postMessage(msg);
}

async function applyPlan(plan: VariablePlan): Promise<void> {
  const errors: PlanError[] = [];
  let created = 0;

  post({
    type: "progress",
    pct: 0,
    line: `Preparing ${plan.variables.length} variables…`,
    tone: "dim",
  });

  // Ensure each collection exists and remember its mode id.
  const collections = new Map<
    string,
    { collection: VariableCollection; modeId: string }
  >();
  for (const c of plan.collections) {
    const existing = figma.variables
      .getLocalVariableCollections()
      .find((vc) => vc.name === c.name);
    const collection =
      existing ?? figma.variables.createVariableCollection(c.name);
    // Rename the default mode to our mode name for consistency.
    const modeId = collection.modes[0]!.modeId;
    if (collection.modes[0]!.name !== c.mode) {
      collection.renameMode(modeId, c.mode);
    }
    collections.set(c.name, { collection, modeId });
    post({
      type: "progress",
      pct: 5,
      line: `Collection "${c.name}" ready (mode: ${c.mode})`,
      tone: "plain",
    });
  }

  // Build a name→existing-variable map per collection for idempotent re-runs.
  const existingByCollection = new Map<string, Map<string, Variable>>();
  for (const [name, { collection }] of collections.entries()) {
    const map = new Map<string, Variable>();
    for (const v of figma.variables.getLocalVariables()) {
      if (v.variableCollectionId === collection.id) map.set(v.name, v);
    }
    existingByCollection.set(name, map);
  }

  const total = plan.variables.length;
  for (let i = 0; i < total; i++) {
    const op = plan.variables[i]!;
    const target = collections.get(op.collection);
    if (!target) {
      errors.push({
        variable: op.name,
        reason: `collection "${op.collection}" not initialised`,
        source: op.source,
      });
      continue;
    }
    try {
      const { collection, modeId } = target;
      const map = existingByCollection.get(op.collection)!;
      let v = map.get(op.name);
      if (!v) {
        v = figma.variables.createVariable(op.name, collection, op.resolvedType);
        map.set(op.name, v);
      }
      const value = coerceValue(op);
      if (value === null) {
        errors.push({
          variable: op.name,
          reason: `could not coerce value "${String(op.value)}" to ${op.resolvedType}`,
          source: op.source,
        });
        continue;
      }
      v.setValueForMode(modeId, value);
      created++;
    } catch (e) {
      errors.push({
        variable: op.name,
        reason: e instanceof Error ? e.message : String(e),
        source: op.source,
      });
    }

    if ((i + 1) % Math.max(1, Math.floor(total / 20)) === 0 || i === total - 1) {
      const pct = Math.round(((i + 1) / total) * 100);
      post({
        type: "progress",
        pct,
        line: `Created ${created}/${total} variables`,
        tone: "plain",
      });
    }
  }

  post({ type: "done", created, errors });
}

function coerceValue(op: VariableOp): VariableValue | null {
  if (op.resolvedType === "COLOR") {
    if (typeof op.value !== "string") return null;
    const rgba = hexToRgba(op.value);
    if (!rgba) return null;
    return rgba;
  }
  // FLOAT
  if (typeof op.value === "number") return op.value;
  if (typeof op.value === "string") {
    const n = parseFloat(op.value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
