"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
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
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/shared/dtcg/parse.ts
  var SUPPORTED_TYPES = /* @__PURE__ */ new Set([
    "color",
    "dimension",
    "number"
  ]);
  function isLeaf(node) {
    return !!node && typeof node === "object" && "$value" in node && "$type" in node;
  }
  function isGroup(node) {
    return !!node && typeof node === "object" && !Array.isArray(node);
  }
  function isAliasValue(raw) {
    return typeof raw === "string" && raw.length >= 3 && raw.startsWith("{") && raw.endsWith("}");
  }
  function aliasPath(raw) {
    return raw.slice(1, -1).trim();
  }
  function parseFiles(files) {
    const tokens = [];
    const warnings = [];
    for (const f of files) {
      if (!isGroup(f.json)) {
        warnings.push({
          file: f.path,
          path: "(root)",
          reason: "file root is not a JSON object"
        });
        continue;
      }
      walk(f.json, [], f.path, tokens, warnings);
    }
    return { tokens, warnings };
  }
  function expandTokensStudio(f) {
    const root = f.json;
    const isTokensStudio = Array.isArray(root.$themes) && root.$themes.length > 0 || root.$metadata != null && typeof root.$metadata === "object" && Array.isArray(root.$metadata.tokenSetOrder);
    if (!isTokensStudio) return [f];
    const meta = root.$metadata;
    const setOrder = Array.isArray(meta == null ? void 0 : meta.tokenSetOrder) ? meta.tokenSetOrder : Object.keys(root).filter((k) => !k.startsWith("$"));
    return setOrder.filter((key) => key in root && !key.startsWith("$")).map((key) => ({ path: key, json: root[key] }));
  }
  function walk(node, trail, file, out, warnings) {
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      const nextTrail = [...trail, key];
      if (isLeaf(child)) {
        const t = child.$type;
        if (!SUPPORTED_TYPES.has(t)) {
          warnings.push({
            file,
            path: nextTrail.join("/"),
            reason: `unsupported $type "${child.$type}" (MVP supports color, dimension, number)`
          });
          continue;
        }
        const value = normalizeValue(t, child.$value, file, nextTrail, warnings);
        if (value === null) continue;
        out.push({ name: nextTrail.join("/"), type: t, value, file });
      } else if (isGroup(child)) {
        walk(child, nextTrail, file, out, warnings);
      }
    }
  }
  function normalizeValue(type, raw, file, trail, warnings) {
    if (isAliasValue(raw)) return raw;
    if (type === "color") {
      if (typeof raw !== "string") {
        warnings.push({
          file,
          path: trail.join("/"),
          reason: 'color value must be a string (e.g. "#0d99ff") or an alias'
        });
        return null;
      }
      return raw;
    }
    if (type === "dimension") {
      const px = dimensionToPx(raw);
      if (px !== null) return px;
      warnings.push({
        file,
        path: trail.join("/"),
        reason: "dimension value must be a number or string with unit px / rem / em / unitless (ADR-0011)"
      });
      return null;
    }
    if (type === "number") {
      if (typeof raw === "number") return raw;
      if (typeof raw === "string" && Number.isFinite(parseFloat(raw))) {
        return parseFloat(raw);
      }
      warnings.push({
        file,
        path: trail.join("/"),
        reason: "number value must be numeric or an alias"
      });
      return null;
    }
    return null;
  }
  var REM_BASE_PX = 16;
  function dimensionToPx(raw) {
    var _a;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw !== "string") return null;
    const m = raw.trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em)?$/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return null;
    const unit = ((_a = m[2]) != null ? _a : "").toLowerCase();
    return unit === "rem" || unit === "em" ? n * REM_BASE_PX : n;
  }

  // src/shared/dtcg/resolve.ts
  function resolveTokens(tokens, mode) {
    var _a;
    const byName = /* @__PURE__ */ new Map();
    for (const t of tokens) byName.set(t.name, t);
    const warnings = [];
    const out = [];
    for (const t of tokens) {
      if (!isAliasValue(t.value)) {
        out.push({
          name: t.name,
          type: t.type,
          file: t.file,
          value: { kind: "literal", value: t.value }
        });
        continue;
      }
      const trail = [t.name];
      const seen = /* @__PURE__ */ new Set([t.name]);
      let cursor = t;
      let bad = null;
      while (cursor && isAliasValue(cursor.value)) {
        const target = aliasName(cursor.value);
        const next = byName.get(target);
        if (!next) {
          bad = {
            reason: `alias "${cursor.value}" \u2192 "${target}" does not match any token`
          };
          break;
        }
        if (seen.has(target)) {
          bad = {
            reason: `alias cycle: ${[...trail, target].join(" \u2192 ")}`
          };
          break;
        }
        trail.push(target);
        seen.add(target);
        cursor = next;
      }
      if (bad || !cursor) {
        warnings.push({
          file: t.file,
          path: t.name,
          reason: (_a = bad == null ? void 0 : bad.reason) != null ? _a : "alias did not resolve"
        });
        continue;
      }
      if (cursor.type !== t.type) {
        warnings.push({
          file: t.file,
          path: t.name,
          reason: `alias target "${cursor.name}" has type ${cursor.type}, expected ${t.type}`
        });
        continue;
      }
      if (mode === "resolve") {
        out.push({
          name: t.name,
          type: t.type,
          file: t.file,
          value: { kind: "literal", value: cursor.value }
        });
      } else {
        const directTarget = aliasName(t.value);
        out.push({
          name: t.name,
          type: t.type,
          file: t.file,
          value: { kind: "alias", targetName: directTarget }
        });
      }
    }
    return { tokens: out, warnings };
  }
  function aliasName(raw) {
    return aliasPath(raw).split(".").join("/");
  }

  // src/shared/mapping/toFigma.ts
  var DEFAULT_SETTINGS = {
    refMode: "keepAlias",
    separator: "slash",
    updateExisting: true
  };
  var PRIMITIVES_TOPS = /* @__PURE__ */ new Set([
    "core",
    "palette",
    "figmaonly"
  ]);
  var SEMANTIC_TOPS = /* @__PURE__ */ new Set([
    "semantic",
    "schemestatic",
    "scheme",
    "device",
    "appearance",
    "theme",
    "elements",
    "utilities",
    "helpers"
  ]);
  function collectionForFile(path) {
    var _a;
    const top = ((_a = path.split("/")[0]) != null ? _a : "").toLowerCase();
    if (PRIMITIVES_TOPS.has(top)) return { collection: "Primitives" };
    if (SEMANTIC_TOPS.has(top)) return { collection: "Semantic" };
    if (top === "components") return { collection: "Components" };
    if (!path.includes("/")) return { collection: "Primitives" };
    return {
      collection: "Primitives",
      fallbackWarning: {
        file: path,
        path: "(root)",
        reason: `unknown top-level folder "${path.split("/")[0]}" \u2014 defaulted to Primitives`
      }
    };
  }
  function emitName(name, sep) {
    return sep === "dot" ? name.split("/").join(".") : name;
  }
  function basenameMode(path) {
    const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/i, "");
    return base.length === 0 ? base : base[0].toUpperCase() + base.slice(1);
  }
  var ORDERED_COLLECTIONS = [
    "Primitives",
    "Semantic",
    "Components"
  ];
  function planForFiles(filesIn, settings) {
    var _a, _b;
    const warnings = [];
    const byCollection = /* @__PURE__ */ new Map();
    const fileCollection = /* @__PURE__ */ new Map();
    for (const f of filesIn) {
      const { collection, fallbackWarning } = collectionForFile(f.file);
      if (fallbackWarning) warnings.push(fallbackWarning);
      fileCollection.set(f.file, collection);
      const list = (_a = byCollection.get(collection)) != null ? _a : [];
      list.push(f);
      byCollection.set(collection, list);
    }
    const allTokens = filesIn.flatMap((f) => f.tokens);
    const { tokens: resolved, warnings: resolveWarnings } = resolveTokens(
      allTokens,
      settings.refMode
    );
    warnings.push(...resolveWarnings);
    const resolvedByFileName = /* @__PURE__ */ new Map();
    for (const t of resolved) {
      resolvedByFileName.set(`${t.file}::${t.name}`, t);
    }
    const tokenFileByName = /* @__PURE__ */ new Map();
    for (const t of allTokens) {
      if (!tokenFileByName.has(t.name)) tokenFileByName.set(t.name, t.file);
    }
    const collectionPlans = [];
    const variables = [];
    const allThemeGroups = [];
    for (const cname of ORDERED_COLLECTIONS) {
      const cFiles = byCollection.get(cname);
      if (!cFiles || cFiles.length === 0) continue;
      const themeGroups = detectThemeGroups(cname, cFiles);
      allThemeGroups.push(...themeGroups);
      const modeNames = pickModeNames(themeGroups);
      collectionPlans.push({ name: cname, modes: modeNames });
      const opByName = /* @__PURE__ */ new Map();
      for (const group of themeGroups) {
        for (const f of group.files) {
          const modeName = group.kind === "themed" ? basenameMode(f.file) : "Value";
          for (const tok of f.tokens) {
            const r = resolvedByFileName.get(`${f.file}::${tok.name}`);
            if (!r) continue;
            const emittedName = emitName(r.name, settings.separator);
            const resolvedType = r.type === "color" ? "COLOR" : "FLOAT";
            let valueSpec;
            if (r.value.kind === "literal") {
              valueSpec = { kind: "literal", value: r.value.value };
            } else {
              const targetFile = tokenFileByName.get(r.value.targetName);
              const targetCollection = targetFile ? (_b = fileCollection.get(targetFile)) != null ? _b : "Primitives" : "Primitives";
              valueSpec = {
                kind: "alias",
                targetCollection,
                targetName: emitName(r.value.targetName, settings.separator)
              };
            }
            let existing = opByName.get(emittedName);
            if (!existing) {
              existing = {
                collection: cname,
                name: emittedName,
                resolvedType,
                values: [],
                source: { file: f.file, path: tok.name },
                op: settings.updateExisting ? "createOrUpdate" : "create"
              };
              opByName.set(emittedName, existing);
            } else if (existing.resolvedType !== resolvedType) {
              warnings.push({
                file: f.file,
                path: tok.name,
                reason: `token "${emittedName}" has conflicting types across modes (${existing.resolvedType} vs ${resolvedType})`
              });
              continue;
            }
            existing.values.push({ mode: modeName, value: valueSpec });
          }
        }
      }
      variables.push(...opByName.values());
    }
    return {
      collections: collectionPlans,
      variables,
      warnings,
      themeGroups: allThemeGroups
    };
  }
  function detectThemeGroups(collection, files) {
    var _a;
    const byDir = /* @__PURE__ */ new Map();
    for (const f of files) {
      const dir = dirOf(f.file);
      const list = (_a = byDir.get(dir)) != null ? _a : [];
      list.push(f);
      byDir.set(dir, list);
    }
    const out = [];
    for (const [dir, list] of byDir.entries()) {
      if (list.length > 1 && sameShape(list)) {
        out.push({ kind: "themed", collection, dir, files: list });
      } else {
        for (const f of list) {
          out.push({ kind: "single", collection, dir, files: [f] });
        }
      }
    }
    return out;
  }
  function dirOf(path) {
    const i = path.lastIndexOf("/");
    return i < 0 ? "" : path.slice(0, i);
  }
  function shapeKey(tokens) {
    return tokens.map((t) => `${t.name}:${t.type}`).sort().join("|");
  }
  function sameShape(files) {
    if (files.length < 2) return true;
    const first = shapeKey(files[0].tokens);
    if (first.length === 0) return false;
    for (let i = 1; i < files.length; i++) {
      if (shapeKey(files[i].tokens) !== first) return false;
    }
    return true;
  }
  function pickModeNames(groups) {
    const names = [];
    let hasSingle = false;
    for (const g of groups) {
      if (g.kind === "themed") {
        for (const f of g.files) {
          const m = basenameMode(f.file);
          if (!names.includes(m)) names.push(m);
        }
      } else {
        hasSingle = true;
      }
    }
    if (hasSingle && !names.includes("Value")) names.push("Value");
    if (names.length === 0) names.push("Value");
    const defaultIdx = names.findIndex((n) => n.toLowerCase() === "default");
    if (defaultIdx > 0) {
      const [d] = names.splice(defaultIdx, 1);
      names.unshift(d);
    }
    return names;
  }

  // src/ui/transport/sandboxTransport.ts
  function createSandboxTransport() {
    const handlers = /* @__PURE__ */ new Set();
    window.addEventListener("message", (e) => {
      const msg = e.data && e.data.pluginMessage;
      if (!msg) return;
      for (const h of handlers) h(msg);
    });
    return {
      postCode: (msg) => parent.postMessage({ pluginMessage: msg }, "*"),
      addMessageListener: (handler) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      }
    };
  }

  // src/ui/settings/validate.ts
  function mergeWithDefaults(raw) {
    if (!raw || typeof raw !== "object") return __spreadValues({}, DEFAULT_SETTINGS);
    const r = raw;
    return {
      refMode: r.refMode === "resolve" ? "resolve" : "keepAlias",
      separator: r.separator === "dot" ? "dot" : "slash",
      updateExisting: typeof r.updateExisting === "boolean" ? r.updateExisting : DEFAULT_SETTINGS.updateExisting
    };
  }

  // src/ui/settings/settingsStore.ts
  function createSettingsStore(storage) {
    let current = __spreadValues({}, DEFAULT_SETTINGS);
    const listeners = /* @__PURE__ */ new Set();
    const broadcast = () => {
      for (const l of listeners) l(current);
    };
    void storage.load().then((raw) => {
      current = mergeWithDefaults(raw);
      broadcast();
    });
    return {
      get: () => current,
      update: (patch) => {
        current = mergeWithDefaults(__spreadValues(__spreadValues({}, current), patch));
        broadcast();
        void storage.save(current);
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      hydrateFrom: (raw) => {
        current = mergeWithDefaults(raw);
        broadcast();
      }
    };
  }

  // src/ui/settings/postMessageStorage.ts
  function createPostMessageStorage(transport2) {
    return {
      load: () => new Promise((resolve) => {
        const unsubscribe = transport2.addMessageListener((msg) => {
          if (msg.type !== "settings") return;
          unsubscribe();
          resolve(msg.settings);
        });
        transport2.postCode({ type: "readSettings" });
      }),
      save: async (settings) => {
        transport2.postCode({ type: "writeSettings", settings });
      }
    };
  }

  // src/shared/intake/tokenIntake.ts
  function fromUploads(uploads) {
    var _a;
    const figmaUploads = uploads.flatMap(
      (u) => expandTokensStudio({ path: u.path, json: u.json })
    );
    const { tokens, warnings } = parseFiles(figmaUploads);
    const tokensByFile = /* @__PURE__ */ new Map();
    for (const fu of figmaUploads) tokensByFile.set(fu.path, []);
    for (const t of tokens) (_a = tokensByFile.get(t.file)) == null ? void 0 : _a.push(t);
    const files = figmaUploads.map((fu) => {
      var _a2;
      return {
        file: fu.path,
        tokens: (_a2 = tokensByFile.get(fu.path)) != null ? _a2 : []
      };
    });
    return { files, warnings, parseFailures: [] };
  }

  // src/ui/intake/fileReader.ts
  async function readJsonFiles(files) {
    const jsonFiles = Array.from(files).filter((f) => f.name.endsWith(".json"));
    const texts = await Promise.all(jsonFiles.map((f) => f.text()));
    const uploads = [];
    const parseFailures = [];
    for (let i = 0; i < jsonFiles.length; i++) {
      const path = relativePath(jsonFiles[i]);
      try {
        uploads.push({ path, json: JSON.parse(texts[i]) });
      } catch (e) {
        parseFailures.push({
          path,
          reason: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`
        });
      }
    }
    return { uploads, parseFailures };
  }
  function relativePath(f) {
    const rel = f.webkitRelativePath;
    if (rel && rel.length > 0) {
      const parts = rel.split("/");
      return parts.length > 1 ? parts.slice(1).join("/") : rel;
    }
    return f.name;
  }

  // src/ui/index.ts
  var transport = createSandboxTransport();
  var settingsStorage = createPostMessageStorage(transport);
  var settingsStore = createSettingsStore(settingsStorage);
  var state = {
    step: 1,
    files: [],
    settingsOpen: false,
    importing: false,
    done: false,
    progress: 0,
    log: []
  };
  settingsStore.subscribe(() => {
    planCache = null;
    render();
  });
  var $ = (id) => document.getElementById(id);
  var planCache = null;
  function setState(patch) {
    Object.assign(state, patch);
    planCache = null;
    render();
  }
  function appendLog(text, tone) {
    setState({ log: [...state.log, { text, tone }] });
  }
  function clearLog() {
    setState({ log: [] });
  }
  function toggleFileSelection(path) {
    setState({
      files: state.files.map(
        (f) => f.path === path ? __spreadProps(__spreadValues({}, f), { selected: !f.selected }) : f
      )
    });
  }
  function selectedFiles() {
    return state.files.filter((f) => f.selected);
  }
  function computePlan() {
    const sel = selectedFiles();
    const settings = settingsStore.get();
    const key = sel.map((f) => f.path).join("|") + "::" + settings.refMode + "/" + settings.separator + "/" + (settings.updateExisting ? "u" : "c");
    if (planCache && planCache.key === key) return planCache.plan;
    const fts = sel.map((f) => ({ file: f.path, tokens: f.tokens }));
    const plan = planForFiles(fts, settings);
    planCache = { key, plan };
    return plan;
  }
  async function handleFiles(fileList) {
    const { uploads, parseFailures } = await readJsonFiles(fileList);
    const { files: fileTokens, warnings } = fromUploads(uploads);
    for (const w of warnings) {
      appendLog(`${w.file} \xB7 ${w.path} \u2014 ${w.reason}`, "err");
    }
    for (const f of parseFailures) {
      appendLog(`${f.path} \u2014 ${f.reason}`, "err");
    }
    const out = fileTokens.map((ft) => {
      const parts = ft.file.split("/");
      const name = parts[parts.length - 1];
      const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
      return {
        path: ft.file,
        name,
        folder,
        tokens: ft.tokens,
        selected: true
      };
    });
    out.sort((a, b) => (a.folder + a.name).localeCompare(b.folder + b.name));
    setState({ files: out });
  }
  function startImport() {
    const plan = computePlan();
    if (plan.variables.length === 0) {
      appendLog("No tokens to import.", "err");
      setState({
        step: 4,
        importing: false,
        done: true,
        progress: 0,
        result: { created: 0, updated: 0, errors: [] }
      });
      return;
    }
    clearLog();
    setState({
      step: 4,
      importing: true,
      done: false,
      progress: 0,
      log: [{ text: `Sending ${plan.variables.length} variables to Figma\u2026`, tone: "dim" }]
    });
    postCode({ type: "applyPlan", plan });
  }
  function postCode(msg) {
    transport.postCode(msg);
  }
  transport.addMessageListener((msg) => {
    if (msg.type === "progress") {
      appendLog(msg.line, msg.tone);
      setState({ progress: msg.pct });
    } else if (msg.type === "done") {
      const ERROR_PREVIEW = 12;
      for (const err of msg.errors.slice(0, ERROR_PREVIEW)) {
        appendLog(`${err.source.file} \xB7 ${err.variable} \u2014 ${err.reason}`, "err");
      }
      if (msg.errors.length > ERROR_PREVIEW) {
        appendLog(`\u2026and ${msg.errors.length - ERROR_PREVIEW} more`, "err");
      }
      appendLog(
        `\u2713 Imported ${msg.created} created, ${msg.updated} updated` + (msg.errors.length ? ` (${msg.errors.length} errors)` : ""),
        msg.errors.length ? "err" : "ok"
      );
      setState({
        importing: false,
        done: true,
        progress: 100,
        result: {
          created: msg.created,
          updated: msg.updated,
          errors: msg.errors
        }
      });
    } else if (msg.type === "error") {
      appendLog(`Error: ${msg.message}`, "err");
      setState({ importing: false, done: true });
    }
  });
  function render() {
    const root = $("root");
    root.innerHTML = "";
    root.appendChild(renderTitleBar());
    root.appendChild(renderStepper());
    const content = el("div", "content scroll");
    if (state.step === 1) content.appendChild(renderStep1());
    else if (state.step === 2) content.appendChild(renderStep2());
    else if (state.step === 3) content.appendChild(renderStep3());
    else content.appendChild(renderStep4());
    root.appendChild(content);
    root.appendChild(renderFooter());
    if (state.settingsOpen) root.appendChild(renderSettingsSheet());
  }
  function renderTitleBar() {
    const bar = el("div", "titlebar");
    bar.innerHTML = `
    <div class="logo">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 8 14l5-2.5M3 8 8 10.5 13 8M8 2 3 4.5 8 7l5-2.5L8 2Z"/></svg>
    </div>
    <div class="title">Tokens \u2192 Variables</div>
    <div class="badge">W3C DTCG</div>
    <div class="spacer"></div>
    <button class="iconbtn" id="settingsBtn" title="Settings">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2"/><path d="M13.4 9.6 14.7 11l-1.3 2.2-1.7-.3a5.4 5.4 0 0 1-1.5.9L9.8 15.5H6.2l-.4-1.7a5.4 5.4 0 0 1-1.5-.9l-1.7.3L1.3 11l1.3-1.4a5.4 5.4 0 0 1 0-3.2L1.3 5 2.6 2.8l1.7.3a5.4 5.4 0 0 1 1.5-.9L6.2.5h3.6l.4 1.7a5.4 5.4 0 0 1 1.5.9l1.7-.3L14.7 5l-1.3 1.4a5.4 5.4 0 0 1 0 3.2Z"/></svg>
    </button>
    <button class="iconbtn" id="closeBtn" title="Close">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>
    </button>
  `;
    bar.querySelector("#settingsBtn").onclick = () => setState({ settingsOpen: true });
    bar.querySelector("#closeBtn").onclick = () => postCode({ type: "close" });
    return bar;
  }
  function renderStepper() {
    const bar = el("div", "stepper");
    const labels = ["Source", "Sets", "Preview", "Import"];
    const blue = "#0d99ff";
    labels.forEach((label, i) => {
      const n = i + 1;
      const done = state.step > n;
      const active = state.step === n;
      if (i > 0) {
        const line = el("div", "line");
        line.style.background = state.step >= n ? blue : "#444";
        bar.appendChild(line);
      }
      const step = el("div", "step");
      const circle = el("div", "circle");
      circle.style.background = done || active ? blue : "transparent";
      circle.style.color = done || active ? "#fff" : "#808080";
      circle.style.boxShadow = `inset 0 0 0 1.5px ${done || active ? blue : "#555"}`;
      if (done) {
        circle.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5L13 4"/></svg>`;
      } else {
        circle.textContent = String(n);
      }
      const lbl = el("div", "label", label);
      lbl.style.color = active ? "#fff" : done ? "#b3b3b3" : "#808080";
      step.appendChild(circle);
      step.appendChild(lbl);
      bar.appendChild(step);
    });
    return bar;
  }
  function renderStep1() {
    const wrap = el("div", "step-pad");
    wrap.innerHTML = `
    <div class="h-title">Connect a token source</div>
    <div class="h-sub">Import a folder of W3C Design Token files (DTCG \xB7 2025.10) and map them onto Figma variables.</div>
    <div class="seg">
      <button>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10.5V3M5 6l3-3 3 3"/><path d="M3 10.5v1.8A1.7 1.7 0 0 0 4.7 14h6.6a1.7 1.7 0 0 0 1.7-1.7v-1.8"/></svg>
        Upload folder
      </button>
    </div>
  `;
    const drop = el("label", "dropzone");
    drop.innerHTML = `
    <div class="icon">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="#b3b3b3" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10.5V3M5 6l3-3 3 3"/><path d="M3 10.5v1.8A1.7 1.7 0 0 0 4.7 14h6.6a1.7 1.7 0 0 0 1.7-1.7v-1.8"/></svg>
    </div>
    <div class="primary">Drop a token folder here</div>
    <div class="secondary">or <span class="link">browse files</span> \u2014 nested <span class="mono">.json</span> supported</div>
    <input type="file" id="folderInput" multiple webkitdirectory>
  `;
    const input = drop.querySelector("#folderInput");
    input.onchange = () => {
      if (input.files) void handleFiles(input.files);
    };
    drop.ondragover = (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    };
    drop.ondragleave = () => drop.classList.remove("drag");
    drop.ondrop = async (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      if (!e.dataTransfer) return;
      const files = await readDataTransfer(e.dataTransfer);
      await handleFiles(files);
    };
    wrap.appendChild(drop);
    if (state.files.length > 0) {
      const det = el("div", "detected");
      const totalTokens = state.files.reduce((a, f) => a + f.tokens.length, 0);
      det.innerHTML = `
      <div class="badge">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#3dd07e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5L13 4"/></svg>
      </div>
      <div class="text"><b>${state.files.length} file${state.files.length === 1 ? "" : "s"} detected</b> <span class="dim">\u2014 ${totalTokens} tokens</span></div>
    `;
      wrap.appendChild(det);
    }
    return wrap;
  }
  async function readDataTransfer(dt) {
    var _a;
    const items = Array.from(dt.items || []);
    const out = [];
    const tasks = [];
    for (const it of items) {
      const entry = (_a = it.webkitGetAsEntry) == null ? void 0 : _a.call(it);
      if (entry) {
        tasks.push(walkEntry(entry, out));
      } else {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
    await Promise.all(tasks);
    if (out.length === 0 && dt.files) {
      return Array.from(dt.files);
    }
    return out;
  }
  async function walkEntry(entry, out, prefix = "") {
    if (entry.isFile) {
      await new Promise((res) => {
        entry.file((f) => {
          Object.defineProperty(f, "webkitRelativePath", {
            value: prefix + entry.name,
            configurable: true
          });
          out.push(f);
          res();
        });
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await new Promise((res) => reader.readEntries(res));
      for (const e of entries) {
        await walkEntry(e, out, prefix + entry.name + "/");
      }
    }
  }
  function renderStep2() {
    var _a;
    const wrap = el("div", "step-pad");
    wrap.innerHTML = `
    <div class="h-title">Select token sets</div>
    <div class="h-sub">Files in <span class="mono">core/</span> become Primitives, <span class="mono">semantic/</span> Semantic, <span class="mono">components/</span> Components. Sibling files with matching shape become modes.</div>
  `;
    const groups = /* @__PURE__ */ new Map();
    for (const f of state.files) {
      const list = (_a = groups.get(f.folder)) != null ? _a : [];
      list.push(f);
      groups.set(f.folder, list);
    }
    const stack = el("div");
    stack.style.display = "flex";
    stack.style.flexDirection = "column";
    stack.style.gap = "16px";
    for (const [folder, files] of groups) {
      const block = el("div");
      const header = el("div", "group-header");
      header.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 16 16" fill="#7a7a7a"><path d="M2 4.2a1 1 0 0 1 1-1h2.6l1.2 1.3H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.2Z"/></svg>
      <span class="name mono">${folder === "(root)" ? "./" : folder + "/"}</span>
    `;
      block.appendChild(header);
      const list = el("div", "file-list");
      for (const f of files) {
        const row = el("div", "file-row" + (f.selected ? " checked" : ""));
        row.innerHTML = `
        <div class="box">${f.selected ? `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5L13 4"/></svg>` : ""}</div>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#7a7a7a" stroke-width="1.3"><path d="M4 2h5l3 3v9H4V2Z"/><path d="M9 2v3h3"/></svg>
        <div class="name mono">${f.name}</div>
        <div class="count">${f.tokens.length}</div>
      `;
        row.onclick = () => toggleFileSelection(f.path);
        list.appendChild(row);
      }
      block.appendChild(list);
      stack.appendChild(block);
    }
    wrap.appendChild(stack);
    return wrap;
  }
  var PREVIEW_PER_COLLECTION = 100;
  function renderStep3() {
    var _a, _b;
    const wrap = el("div", "step-pad");
    const plan = computePlan();
    const totalVars = plan.variables.length;
    const totalModes = plan.collections.reduce((a, c) => a + c.modes.length, 0);
    const stats = el("div", "stats");
    stats.innerHTML = `
    <div class="stat"><div class="n">${totalVars}</div><div class="l">Variables</div></div>
    <div class="stat"><div class="n">${plan.collections.length}</div><div class="l">Collections</div></div>
    <div class="stat"><div class="n">${totalModes}</div><div class="l">Modes</div></div>
    <div class="stat"><div class="n">${selectedFiles().length}</div><div class="l">Files</div></div>
  `;
    wrap.appendChild(stats);
    const byCollection = /* @__PURE__ */ new Map();
    for (const v of plan.variables) {
      const list = (_a = byCollection.get(v.collection)) != null ? _a : [];
      list.push(v);
      byCollection.set(v.collection, list);
    }
    for (const cplan of plan.collections) {
      const vars = (_b = byCollection.get(cplan.name)) != null ? _b : [];
      const col = el("div", "collection");
      const modeChips = cplan.modes.map((m) => `<span class="mode-chip">${escapeHtml(m)}</span>`).join("");
      col.innerHTML = `
      <div class="collection-head">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#9a9a9a" stroke-width="1.4"><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.2"/><path d="M8 2.4v11.2M2.4 8h11.2"/></svg>
        <span class="n">${escapeHtml(cplan.name)}</span>
        <div class="spacer"></div>
        <span class="mode-chips">${modeChips}</span>
        <span class="count">${vars.length}</span>
      </div>
    `;
      const list = el("div");
      for (const v of vars.slice(0, PREVIEW_PER_COLLECTION)) {
        list.appendChild(renderVarRow(v, cplan.modes.length > 1));
      }
      col.appendChild(list);
      wrap.appendChild(col);
      if (vars.length > PREVIEW_PER_COLLECTION) {
        const note = el("div", "h-sub");
        note.style.marginTop = "4px";
        note.style.marginBottom = "12px";
        note.textContent = `Showing first ${PREVIEW_PER_COLLECTION} of ${vars.length} in ${cplan.name}. All will be imported.`;
        wrap.appendChild(note);
      }
    }
    if (plan.warnings.length > 0) {
      const w = el("div", "warnings");
      w.innerHTML = `<div class="warnings-head">${plan.warnings.length} parse warning${plan.warnings.length === 1 ? "" : "s"}</div>`;
      for (const pw of plan.warnings.slice(0, 8)) {
        const ln = el("div", "warning-ln");
        ln.textContent = `${pw.file} \xB7 ${pw.path} \u2014 ${pw.reason}`;
        w.appendChild(ln);
      }
      if (plan.warnings.length > 8) {
        const more = el("div", "warning-ln");
        more.textContent = `\u2026and ${plan.warnings.length - 8} more`;
        w.appendChild(more);
      }
      wrap.appendChild(w);
    }
    return wrap;
  }
  function renderVarRow(v, showModeTags) {
    var _a;
    const row = el("div", "var-row");
    row.appendChild(renderRowIcon(v.resolvedType, (_a = v.values[0]) == null ? void 0 : _a.value));
    row.appendChild(el("div", "n mono", v.name));
    row.appendChild(el("div", "spacer"));
    const val = el("div", "v mono");
    for (let i = 0; i < v.values.length; i++) {
      if (i > 0) val.appendChild(document.createTextNode(" \xB7 "));
      renderModeValue(val, v.values[i], v.resolvedType, showModeTags);
    }
    row.appendChild(val);
    return row;
  }
  function renderRowIcon(type, sample) {
    if (type === "COLOR" && (sample == null ? void 0 : sample.kind) === "literal") {
      const s = el("span", "swatch");
      s.style.background = String(sample.value);
      return s;
    }
    if ((sample == null ? void 0 : sample.kind) === "alias") return el("span", "hash", "\u2192");
    return el("span", "hash", "#");
  }
  function renderModeValue(into, mv, type, showModeTag) {
    if (showModeTag) into.appendChild(el("span", "mode-tag", mv.mode));
    if (mv.value.kind === "alias") {
      into.appendChild(el("span", "alias-ref", `\u2192 ${mv.value.targetName}`));
      return;
    }
    if (type === "COLOR") {
      const sm = el("span", "swatch-sm");
      sm.style.background = String(mv.value.value);
      into.appendChild(sm);
    }
    into.appendChild(document.createTextNode(String(mv.value.value)));
  }
  function renderStep4() {
    var _a, _b, _c, _d, _e, _f;
    const wrap = el("div", "step-pad");
    if (state.importing) {
      const c = el("div", "run-center");
      c.innerHTML = `
      <div class="run-spinner">
        <svg width="46" height="46" viewBox="0 0 46 46" style="animation: spin 0.9s linear infinite;"><circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4"/><circle cx="23" cy="23" r="19" fill="none" stroke="#0d99ff" stroke-width="4" stroke-linecap="round" stroke-dasharray="40 200"/></svg>
      </div>
      <div class="run-title">Creating variables\u2026</div>
      <div class="run-pct">${state.progress}% complete</div>
    `;
      wrap.appendChild(c);
      const bar = el("div", "progressbar");
      const fill = el("div", "fill");
      fill.style.width = `${state.progress}%`;
      bar.appendChild(fill);
      wrap.appendChild(bar);
    } else if (state.done) {
      const c = el("div", "done-center");
      c.innerHTML = `
      <div class="done-icon">
        <svg width="26" height="26" viewBox="0 0 16 16" fill="none" stroke="#3dd07e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5L13 4"/></svg>
      </div>
      <div class="done-title">Import complete</div>
      <div class="done-sub">Variables are now live in your Figma file.</div>
    `;
      wrap.appendChild(c);
      const stats = el("div", "done-stats");
      const created = (_b = (_a = state.result) == null ? void 0 : _a.created) != null ? _b : 0;
      const updated = (_d = (_c = state.result) == null ? void 0 : _c.updated) != null ? _d : 0;
      const errors = (_f = (_e = state.result) == null ? void 0 : _e.errors.length) != null ? _f : 0;
      const warnings = computePlan().warnings.length;
      stats.innerHTML = `
      <div class="cell"><div class="big" style="color:#3dd07e">${created}</div><div class="lbl">variables<br/>created</div></div>
      <div class="cell"><div class="big" style="color:#5cb8ff">${updated}</div><div class="lbl">variables<br/>updated</div></div>
      <div class="cell"><div class="big" style="color:${errors ? "#ff8b8b" : "#6b6b6b"}">${errors}</div><div class="lbl">errors<br/>skipped</div></div>
      <div class="cell"><div class="big" style="color:#6b6b6b">${warnings}</div><div class="lbl">parse<br/>warnings</div></div>
    `;
      wrap.appendChild(stats);
    }
    wrap.appendChild(el("div", "console-label", "CONSOLE"));
    const con = el("div", "console");
    for (const ln of state.log) {
      const row = el("div", "ln");
      row.style.color = toneColor(ln.tone);
      row.innerHTML = `<span class="arr">\u203A</span><span>${escapeHtml(ln.text)}</span>`;
      con.appendChild(row);
    }
    wrap.appendChild(con);
    return wrap;
  }
  function toneColor(t) {
    return {
      dim: "#7a7a7a",
      plain: "#c4c4c4",
      accent: "#b9a6ff",
      ok: "#3dd07e",
      err: "#ff8b8b"
    }[t];
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderFooter() {
    const bar = el("div", "footer");
    if (state.step < 4) {
      if (state.step === 2 || state.step === 3) {
        const back = el("button", "btn", "Back");
        back.onclick = () => setState({ step: state.step - 1 });
        bar.appendChild(back);
      }
      bar.appendChild(el("div", "spacer"));
      if (state.step === 2) {
        const sc = el("span", "selcount", `${selectedFiles().length} sets selected`);
        bar.appendChild(sc);
      }
      const primary = el("button", "btn primary");
      let label = "Continue";
      let disabled = false;
      let onclick = () => {
      };
      if (state.step === 1) {
        label = "Continue";
        disabled = state.files.length === 0;
        onclick = () => setState({ step: 2 });
      } else if (state.step === 2) {
        label = "Preview import";
        disabled = selectedFiles().length === 0;
        onclick = () => setState({ step: 3 });
      } else if (state.step === 3) {
        const count = computePlan().variables.length;
        label = `Import ${count} variables`;
        disabled = count === 0;
        onclick = startImport;
      }
      primary.textContent = label;
      primary.disabled = disabled;
      primary.onclick = onclick;
      bar.appendChild(primary);
    } else if (state.importing) {
      bar.appendChild(el("div", "spacer"));
      bar.appendChild(el("div", "info", "Importing\u2026 please keep the plugin open"));
      bar.appendChild(el("div", "spacer"));
    } else if (state.done) {
      const again = el("button", "btn", "Import another");
      again.onclick = () => setState({
        step: 1,
        files: [],
        done: false,
        importing: false,
        progress: 0,
        log: [],
        result: void 0
      });
      bar.appendChild(again);
      bar.appendChild(el("div", "spacer"));
      const close = el("button", "btn primary", "Close");
      close.onclick = () => postCode({ type: "close" });
      bar.appendChild(close);
    }
    return bar;
  }
  function renderSettingsSheet() {
    const overlay = el("div", "sheet-overlay");
    overlay.onclick = (e) => {
      if (e.target === overlay) setState({ settingsOpen: false });
    };
    const sheet = el("div", "sheet");
    const head = el("div", "sheet-head");
    head.innerHTML = `
    <div class="sheet-title">Settings</div>
    <button class="iconbtn" id="sheetClose" title="Close settings">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>
    </button>
  `;
    head.querySelector("#sheetClose").onclick = () => setState({ settingsOpen: false });
    sheet.appendChild(head);
    const body = el("div", "sheet-body scroll");
    body.appendChild(
      settingsRow(
        "Reference handling",
        "How to treat alias values like {color.blue.500}.",
        segmented(
          [
            { id: "keepAlias", label: "Keep as alias" },
            { id: "resolve", label: "Resolve to raw value" }
          ],
          settingsStore.get().refMode,
          (id) => {
            settingsStore.update({
              refMode: id
            });
          }
        )
      )
    );
    body.appendChild(
      settingsRow(
        "Group separator",
        "Variable name segments are joined with this character.",
        segmented(
          [
            { id: "slash", label: "/  Slash" },
            { id: "dot", label: ".  Dot" }
          ],
          settingsStore.get().separator,
          (id) => {
            settingsStore.update({
              separator: id
            });
          }
        )
      )
    );
    body.appendChild(
      settingsRow(
        "Update existing variables",
        "Match by (collection, name) and overwrite values in place. When off, re-imports leave existing variables untouched.",
        toggle(settingsStore.get().updateExisting, (v) => {
          settingsStore.update({ updateExisting: v });
        })
      )
    );
    const themedGroups = computePlan().themeGroups.filter(
      (g) => g.kind === "themed"
    );
    if (themedGroups.length > 0) {
      const tBlock = el("div", "theme-block");
      tBlock.appendChild(el("div", "settings-h", "Themes detected"));
      tBlock.appendChild(
        el(
          "div",
          "settings-sub",
          "Sibling files with matching shape are folded into modes of one collection."
        )
      );
      for (const g of themedGroups) {
        const row = el("div", "theme-row");
        const head2 = el("div", "theme-row-head");
        head2.innerHTML = `<span class="theme-collection">${escapeHtml(g.collection)}</span> <span class="theme-dir mono">${escapeHtml(g.dir || "(root)")}/</span>`;
        row.appendChild(head2);
        for (const f of g.files) {
          const mr = el("div", "theme-mode");
          mr.innerHTML = `<span class="theme-mode-name">${escapeHtml(basenameMode(f.file))}</span> <span class="theme-mode-file mono">${escapeHtml(f.file)}</span>`;
          row.appendChild(mr);
        }
        tBlock.appendChild(row);
      }
      body.appendChild(tBlock);
    }
    sheet.appendChild(body);
    overlay.appendChild(sheet);
    return overlay;
  }
  function settingsRow(title, sub, control) {
    const row = el("div", "settings-row");
    const meta = el("div", "settings-meta");
    meta.appendChild(el("div", "settings-h", title));
    meta.appendChild(el("div", "settings-sub", sub));
    row.appendChild(meta);
    row.appendChild(control);
    return row;
  }
  function segmented(options, current, onChange) {
    const seg = el("div", "seg-settings");
    for (const o of options) {
      const b = el("button", "seg-btn" + (o.id === current ? " active" : ""), o.label);
      b.onclick = () => onChange(o.id);
      seg.appendChild(b);
    }
    return seg;
  }
  function toggle(on, onChange) {
    const wrap = el("button", "toggle" + (on ? " on" : ""));
    wrap.innerHTML = `<span class="knob"></span>`;
    wrap.onclick = () => onChange(!on);
    return wrap;
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== void 0) e.textContent = text;
    return e;
  }
  render();
})();
