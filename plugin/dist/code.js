"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };

  // src/shared/writer/setupCollections.ts
  function setupCollections(plan, api, onProgress) {
    var _a, _b;
    const all = api.listCollections();
    const out = /* @__PURE__ */ new Map();
    for (const c of plan.collections) {
      const existing = all.find((vc) => vc.handle.name === c.name);
      const collection = existing != null ? existing : api.createCollection(c.name);
      const modeIds = /* @__PURE__ */ new Map();
      const wantedFirst = (_a = c.modes[0]) != null ? _a : "Value";
      const initialMode = (_b = collection.modes.find(
        (m) => m.modeId === collection.defaultModeId
      )) != null ? _b : collection.modes[0];
      if (initialMode.name !== wantedFirst) {
        api.renameMode(collection.handle.id, initialMode.modeId, wantedFirst);
      }
      modeIds.set(wantedFirst, initialMode.modeId);
      const skippedModes = /* @__PURE__ */ new Set();
      let modesLimited = false;
      for (let i = 1; i < c.modes.length; i++) {
        const name = c.modes[i];
        const found = collection.modes.find((m) => m.name === name);
        if (found) {
          modeIds.set(name, found.modeId);
        } else {
          try {
            modeIds.set(name, api.addMode(collection.handle.id, name));
          } catch (e) {
            modesLimited = true;
            for (let j = i; j < c.modes.length; j++) skippedModes.add(c.modes[j]);
            break;
          }
        }
      }
      out.set(c.name, { handle: collection.handle, modeIds, skippedModes });
      const addedModes = modeIds.size;
      const writeTarget = `default \u2192 "${wantedFirst}" (${initialMode.modeId})`;
      onProgress({
        pct: 5,
        line: modesLimited ? `Collection "${c.name}" ready (${addedModes} of ${c.modes.length} modes, ${writeTarget} \u2014 upgrade Figma plan for multi-mode support)` : `Collection "${c.name}" ready (${addedModes} mode${addedModes === 1 ? "" : "s"}: ${[...modeIds.keys()].join(", ")}; ${writeTarget})`,
        tone: modesLimited ? "err" : "plain"
      });
    }
    return out;
  }

  // src/shared/writer/upsertVariables.ts
  function upsertVariables(plan, api, collections) {
    const existing = indexExistingVariables(api, collections);
    const varByKey = /* @__PURE__ */ new Map();
    const errors = [];
    let created = 0;
    let updated = 0;
    for (const op of plan.variables) {
      const target = collections.get(op.collection);
      if (!target) {
        errors.push({
          variable: op.name,
          reason: `collection "${op.collection}" not initialised`,
          source: op.source
        });
        continue;
      }
      const inCollection = existing.get(op.collection);
      let v = inCollection.get(op.name);
      if (v) {
        if (op.op === "create") {
          errors.push({
            variable: op.name,
            reason: `variable already exists in "${op.collection}" and "update existing" is off`,
            source: op.source
          });
          continue;
        }
        updated++;
      } else {
        try {
          v = api.createVariable(op.name, target.handle.id, op.resolvedType);
          inCollection.set(op.name, v);
          created++;
        } catch (e) {
          errors.push({
            variable: op.name,
            reason: e instanceof Error ? e.message : String(e),
            source: op.source
          });
          continue;
        }
      }
      varByKey.set(`${op.collection}::${op.name}`, v);
    }
    return { varByKey, created, updated, errors };
  }
  function indexExistingVariables(api, collections) {
    const idToName = /* @__PURE__ */ new Map();
    for (const [n, { handle }] of collections.entries()) {
      idToName.set(handle.id, n);
    }
    const out = /* @__PURE__ */ new Map();
    for (const cname of collections.keys()) out.set(cname, /* @__PURE__ */ new Map());
    for (const v of api.listVariables()) {
      const cname = idToName.get(v.handle.collectionId);
      if (cname) out.get(cname).set(v.handle.name, v.handle);
    }
    return out;
  }

  // src/shared/dtcg/parse.ts
  function parseColor(input) {
    const s = input.trim();
    if (s.startsWith("#")) return hexToRgba(s);
    if (/^rgba?\s*\(/i.test(s)) return rgbFuncToRgba(s);
    return null;
  }
  var hexToRgba = (hex) => {
    let h = hex.trim();
    if (h.startsWith("#")) h = h.slice(1);
    if (h.length === 3) {
      h = h.split("").map((c) => c + c).join("");
    }
    if (h.length !== 6 && h.length !== 8) return null;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
  };
  function rgbFuncToRgba(s) {
    const open = s.indexOf("(");
    const close = s.lastIndexOf(")");
    if (open < 0 || close <= open) return null;
    const parts = s.slice(open + 1, close).split(/[,\s/]+/).map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length !== 3 && parts.length !== 4) return null;
    const ch = parts.slice(0, 3).map(parseChannel);
    if (ch.some((n) => n === null)) return null;
    const a = parts.length === 4 ? parseAlpha(parts[3]) : 1;
    if (a === null) return null;
    return { r: ch[0], g: ch[1], b: ch[2], a };
  }
  function parseChannel(p) {
    if (p.endsWith("%")) {
      const n2 = parseFloat(p.slice(0, -1));
      return Number.isFinite(n2) ? clamp01(n2 / 100) : null;
    }
    const n = parseFloat(p);
    return Number.isFinite(n) ? clamp01(n / 255) : null;
  }
  function parseAlpha(p) {
    if (p.endsWith("%")) {
      const n2 = parseFloat(p.slice(0, -1));
      return Number.isFinite(n2) ? clamp01(n2 / 100) : null;
    }
    const n = parseFloat(p);
    return Number.isFinite(n) ? clamp01(n) : null;
  }
  function clamp01(n) {
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  // src/shared/writer/coerceValue.ts
  function coerceValue(op, spec, varByKey) {
    if (spec.kind === "alias") {
      const target = varByKey.get(`${spec.targetCollection}::${spec.targetName}`);
      if (!target) return null;
      return { kind: "alias", variableHandle: target };
    }
    if (op.resolvedType === "COLOR") {
      if (typeof spec.value !== "string") return null;
      return parseColor(spec.value);
    }
    return typeof spec.value === "number" ? spec.value : null;
  }

  // src/shared/writer/writeValues.ts
  async function writeValues(plan, api, collections, varByKey, created, updated, onProgress) {
    const errors = [];
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
          if (!target.skippedModes.has(mv.mode)) {
            errors.push({
              variable: op.name,
              reason: `mode "${mv.mode}" not initialised on "${op.collection}"`,
              source: op.source
            });
          }
          continue;
        }
        try {
          const value = coerceValue(op, mv.value, varByKey);
          if (value === null) {
            errors.push({
              variable: op.name,
              reason: mv.value.kind === "alias" ? `alias target "${mv.value.targetCollection}::${mv.value.targetName}" not found` : `could not coerce value "${String(mv.value.value)}" to ${op.resolvedType}`,
              source: op.source
            });
            continue;
          }
          api.setValueForMode(v.id, modeId, value);
        } catch (e) {
          errors.push({
            variable: op.name,
            reason: e instanceof Error ? e.message : String(e),
            source: op.source
          });
        }
      }
      if (i % Math.max(1, Math.floor(total / 20)) === 0 || i === total) {
        const pct = Math.round(i / total * 100);
        onProgress({
          pct,
          line: `Wrote ${i}/${total} variables (${created} created, ${updated} updated)`,
          tone: "plain"
        });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return errors;
  }

  // src/shared/writer/variableWriter.ts
  async function write(plan, api, opts = {}) {
    var _a;
    const onProgress = (_a = opts.onProgress) != null ? _a : () => {
    };
    onProgress({
      pct: 0,
      line: `Preparing ${plan.variables.length} variables across ${plan.collections.length} collection${plan.collections.length === 1 ? "" : "s"}\u2026`,
      tone: "dim"
    });
    const collections = setupCollections(plan, api, onProgress);
    const { varByKey, created, updated, errors: upsertErrors } = upsertVariables(
      plan,
      api,
      collections
    );
    const writeErrors = await writeValues(
      plan,
      api,
      collections,
      varByKey,
      created,
      updated,
      onProgress
    );
    return {
      created,
      updated,
      errors: [...upsertErrors, ...writeErrors]
    };
  }

  // src/code/figmaApiLive.ts
  async function createFigmaApiLive() {
    const collectionById = /* @__PURE__ */ new Map();
    const variableById = /* @__PURE__ */ new Map();
    for (const c of await figma.variables.getLocalVariableCollectionsAsync()) {
      collectionById.set(c.id, c);
    }
    for (const v of await figma.variables.getLocalVariablesAsync()) {
      variableById.set(v.id, v);
    }
    const mustCollection = (id) => {
      const c = collectionById.get(id);
      if (!c) throw new Error(`collection ${id} not in cache`);
      return c;
    };
    const mustVariable = (id) => {
      const v = variableById.get(id);
      if (!v) throw new Error(`variable ${id} not in cache`);
      return v;
    };
    const toFigmaValue = (value) => {
      if (typeof value === "number") return value;
      if ("kind" in value) {
        const target = mustVariable(value.variableHandle.id);
        return figma.variables.createVariableAlias(target);
      }
      return value;
    };
    return {
      listCollections: () => [...collectionById.values()].map(toExistingCollection),
      createCollection: (name) => {
        const c = figma.variables.createVariableCollection(name);
        collectionById.set(c.id, c);
        return toExistingCollection(c);
      },
      renameMode: (collectionId, modeId, name) => mustCollection(collectionId).renameMode(modeId, name),
      addMode: (collectionId, name) => mustCollection(collectionId).addMode(name),
      listVariables: () => [...variableById.values()].map(toExistingVariable),
      createVariable: (name, collectionId, type) => {
        const c = mustCollection(collectionId);
        const v = figma.variables.createVariable(name, c, type);
        variableById.set(v.id, v);
        return { id: v.id, name: v.name, collectionId: v.variableCollectionId };
      },
      setValueForMode: (variableId, modeId, value) => {
        const v = mustVariable(variableId);
        const figmaValue = toFigmaValue(value);
        v.setValueForMode(modeId, figmaValue);
        if (verifyCount-- > 0) {
          const after = v.valuesByMode[modeId];
          if (!sameVariableValue(after, figmaValue)) {
            throw new Error(
              `setValueForMode readback mismatch on "${v.name}" mode ${modeId}: set ${JSON.stringify(figmaValue)} but valuesByMode reports ${JSON.stringify(after)}`
            );
          }
        }
      }
    };
  }
  var verifyCount = 8;
  function sameVariableValue(a, b) {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
      return false;
    }
    const ao = a;
    const bo = b;
    const keys = /* @__PURE__ */ new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
      const av = ao[k];
      const bv = bo[k];
      if (typeof av === "number" && typeof bv === "number") {
        if (Math.abs(av - bv) > 1e-6) return false;
      } else if (av !== bv) {
        return false;
      }
    }
    return true;
  }
  function toExistingCollection(c) {
    return {
      handle: { id: c.id, name: c.name },
      defaultModeId: c.defaultModeId,
      modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name }))
    };
  }
  function toExistingVariable(v) {
    return {
      handle: { id: v.id, name: v.name, collectionId: v.variableCollectionId }
    };
  }

  // src/code/index.ts
  var SETTINGS_KEY = "boppli.settings.v1";
  figma.showUI(__html__, { width: 480, height: 668, themeColors: true });
  figma.ui.onmessage = (msg) => {
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
  async function applyPlan(plan) {
    try {
      const api = await createFigmaApiLive();
      const report = await write(plan, api, {
        onProgress: (p) => post(__spreadValues({ type: "progress" }, p))
      });
      post(__spreadValues({ type: "done" }, report));
    } catch (e) {
      post({
        type: "error",
        message: e instanceof Error ? e.message : String(e)
      });
    }
  }
  function post(msg) {
    figma.ui.postMessage(msg);
  }
  async function readSettings() {
    const raw = await figma.clientStorage.getAsync(SETTINGS_KEY);
    const settings = raw && typeof raw === "object" ? raw : {};
    post({ type: "settings", settings });
  }
  async function writeSettings(settings) {
    await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
  }
})();
