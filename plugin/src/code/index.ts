import { hexToRgba } from "../shared/dtcg/parse.js";
import type {
  CollectionName,
  ValueSpec,
  VariableOp,
  VariablePlan,
} from "../shared/mapping/toFigma.js";
import type {
  PlanError,
  StoredSettings,
  ToCode,
  ToUI,
} from "./messages.js";

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
    applyPlan(msg.plan).catch((e) => {
      post({
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    });
  }
};

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

type ResolvedCollection = {
  collection: VariableCollection;
  /** Mode name → modeId. */
  modeIds: Map<string, string>;
};

async function applyPlan(plan: VariablePlan): Promise<void> {
  post({
    type: "progress",
    pct: 0,
    line: `Preparing ${plan.variables.length} variables across ${plan.collections.length} collection${plan.collections.length === 1 ? "" : "s"}…`,
    tone: "dim",
  });

  const collections = setupCollections(plan);
  const { varByKey, created, updated, errors: matErrors } =
    materializeVariables(plan, collections);
  const writeErrors = writeValues(plan, collections, varByKey, created, updated);

  post({
    type: "done",
    created,
    updated,
    errors: [...matErrors, ...writeErrors],
  });
}

function setupCollections(
  plan: VariablePlan,
): Map<CollectionName, ResolvedCollection> {
  // Snapshot once: getLocalVariableCollections() walks the whole file.
  const allCollections = figma.variables.getLocalVariableCollections();
  const out = new Map<CollectionName, ResolvedCollection>();

  for (const c of plan.collections) {
    const existing = allCollections.find((vc) => vc.name === c.name);
    const collection = existing ?? figma.variables.createVariableCollection(c.name);

    const modeIds = new Map<string, string>();
    const wantedFirst = c.modes[0] ?? "Value";
    const initialMode = collection.modes[0]!;
    if (initialMode.name !== wantedFirst) {
      collection.renameMode(initialMode.modeId, wantedFirst);
    }
    modeIds.set(wantedFirst, initialMode.modeId);

    for (let i = 1; i < c.modes.length; i++) {
      const name = c.modes[i]!;
      const found = collection.modes.find((m) => m.name === name);
      modeIds.set(name, found ? found.modeId : collection.addMode(name));
    }

    out.set(c.name, { collection, modeIds });
    post({
      type: "progress",
      pct: 5,
      line: `Collection "${c.name}" ready (${c.modes.length} mode${c.modes.length === 1 ? "" : "s"}: ${c.modes.join(", ")})`,
      tone: "plain",
    });
  }
  return out;
}

function materializeVariables(
  plan: VariablePlan,
  collections: Map<CollectionName, ResolvedCollection>,
): {
  varByKey: Map<string, Variable>;
  created: number;
  updated: number;
  errors: PlanError[];
} {
  // Single scan of getLocalVariables(), bucketed by collection id — the API
  // returns every variable in the file on each call.
  const collectionIdByName = new Map<CollectionName, string>();
  for (const [name, { collection }] of collections.entries()) {
    collectionIdByName.set(name, collection.id);
  }
  const existing = new Map<CollectionName, Map<string, Variable>>();
  for (const cname of collections.keys()) existing.set(cname, new Map());
  const idToName = new Map<string, CollectionName>();
  for (const [n, id] of collectionIdByName.entries()) idToName.set(id, n);
  for (const v of figma.variables.getLocalVariables()) {
    const cname = idToName.get(v.variableCollectionId);
    if (cname) existing.get(cname)!.set(v.name, v);
  }

  const varByKey = new Map<string, Variable>();
  const errors: PlanError[] = [];
  let created = 0;
  let updated = 0;

  for (const op of plan.variables) {
    const target = collections.get(op.collection);
    if (!target) {
      errors.push({
        variable: op.name,
        reason: `collection "${op.collection}" not initialised`,
        source: op.source,
      });
      continue;
    }
    const map = existing.get(op.collection)!;
    let v = map.get(op.name);
    if (v) {
      if (op.op === "create") {
        errors.push({
          variable: op.name,
          reason: `variable already exists in "${op.collection}" and "update existing" is off`,
          source: op.source,
        });
        continue;
      }
      updated++;
    } else {
      try {
        v = figma.variables.createVariable(op.name, target.collection, op.resolvedType);
        map.set(op.name, v);
        created++;
      } catch (e) {
        errors.push({
          variable: op.name,
          reason: e instanceof Error ? e.message : String(e),
          source: op.source,
        });
        continue;
      }
    }
    varByKey.set(`${op.collection}::${op.name}`, v);
  }
  return { varByKey, created, updated, errors };
}

function writeValues(
  plan: VariablePlan,
  collections: Map<CollectionName, ResolvedCollection>,
  varByKey: Map<string, Variable>,
  created: number,
  updated: number,
): PlanError[] {
  const errors: PlanError[] = [];
  const total = plan.variables.length;
  let i = 0;
  for (const op of plan.variables) {
    i++;
    const v = varByKey.get(`${op.collection}::${op.name}`);
    const target = collections.get(op.collection);
    if (!v || !target) continue;

    for (const mv of op.values) {
      const modeId = target.modeIds.get(mv.mode);
      if (!modeId) {
        errors.push({
          variable: op.name,
          reason: `mode "${mv.mode}" not initialised on "${op.collection}"`,
          source: op.source,
        });
        continue;
      }
      try {
        const value = coerceValue(op, mv.value, varByKey);
        if (value === null) {
          errors.push({
            variable: op.name,
            reason:
              mv.value.kind === "alias"
                ? `alias target "${mv.value.targetCollection}::${mv.value.targetName}" not found`
                : `could not coerce value "${String(mv.value.value)}" to ${op.resolvedType}`,
            source: op.source,
          });
          continue;
        }
        v.setValueForMode(modeId, value);
      } catch (e) {
        errors.push({
          variable: op.name,
          reason: e instanceof Error ? e.message : String(e),
          source: op.source,
        });
      }
    }

    if (i % Math.max(1, Math.floor(total / 20)) === 0 || i === total) {
      const pct = Math.round((i / total) * 100);
      post({
        type: "progress",
        pct,
        line: `Wrote ${i}/${total} variables (${created} created, ${updated} updated)`,
        tone: "plain",
      });
    }
  }
  return errors;
}

function coerceValue(
  op: VariableOp,
  spec: ValueSpec,
  varByKey: Map<string, Variable>,
): VariableValue | null {
  if (spec.kind === "alias") {
    const target = varByKey.get(`${spec.targetCollection}::${spec.targetName}`);
    if (!target) return null;
    return figma.variables.createVariableAlias(target);
  }
  if (op.resolvedType === "COLOR") {
    if (typeof spec.value !== "string") return null;
    const rgba = hexToRgba(spec.value);
    return rgba ?? null;
  }
  return typeof spec.value === "number" ? spec.value : null;
}
