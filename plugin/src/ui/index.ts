import {
  basenameMode,
  planForFiles,
  type CollectionName,
  type FileTokens,
  type MappingSettings,
  type ModeValue,
  type ThemeGroup,
  type ValueSpec,
  type VariableOp,
  type VariablePlan,
} from "../shared/mapping/toFigma.js";
import type { Token } from "../shared/dtcg/types.js";
import type { LogTone, PlanError, ToCode } from "../code/messages.js";
import { createSandboxTransport } from "./transport/sandboxTransport.js";
import { createSettingsStore } from "./settings/settingsStore.js";
import { createPostMessageStorage } from "./settings/postMessageStorage.js";
import { fromUploads } from "../shared/intake/tokenIntake.js";
import { readJsonFiles } from "./intake/fileReader.js";

type Step = 1 | 2 | 3 | 4;

type FileMeta = {
  path: string;
  name: string;
  folder: string;
  tokens: Token[];
  selected: boolean;
};

type LogLine = { text: string; tone: LogTone };

type State = {
  step: Step;
  files: FileMeta[];
  settingsOpen: boolean;
  importing: boolean;
  done: boolean;
  progress: number;
  log: LogLine[];
  result?: { created: number; updated: number; errors: PlanError[] };
};

const transport = createSandboxTransport();
const settingsStorage = createPostMessageStorage(transport);
const settingsStore = createSettingsStore(settingsStorage);

const state: State = {
  step: 1,
  files: [],
  settingsOpen: false,
  importing: false,
  done: false,
  progress: 0,
  log: [],
};

settingsStore.subscribe(() => {
  planCache = null;
  render();
});

const $ = (id: string) => document.getElementById(id)!;

// Memoise computePlan by (selectedFiles identity + settings identity). Step 3,
// the footer label, and the settings sheet all want the same plan within a
// render pass; without this cache each render runs the planner 3 times.
let planCache: { key: string; plan: VariablePlan } | null = null;

function setState(patch: Partial<State>): void {
  Object.assign(state, patch);
  planCache = null;
  render();
}

function appendLog(text: string, tone: LogTone): void {
  setState({ log: [...state.log, { text, tone }] });
}

function clearLog(): void {
  setState({ log: [] });
}

function toggleFileSelection(path: string): void {
  setState({
    files: state.files.map((f) =>
      f.path === path ? { ...f, selected: !f.selected } : f,
    ),
  });
}

function selectedFiles(): FileMeta[] {
  return state.files.filter((f) => f.selected);
}

function computePlan(): VariablePlan {
  const sel = selectedFiles();
  const settings = settingsStore.get();
  const key =
    sel.map((f) => f.path).join("|") +
    "::" +
    settings.refMode +
    "/" +
    settings.separator +
    "/" +
    (settings.updateExisting ? "u" : "c");
  if (planCache && planCache.key === key) return planCache.plan;
  const fts: FileTokens[] = sel.map((f) => ({ file: f.path, tokens: f.tokens }));
  const plan = planForFiles(fts, settings);
  planCache = { key, plan };
  return plan;
}

// ----- upload handling -----

async function handleFiles(fileList: FileList | File[]): Promise<void> {
  const { uploads, parseFailures } = await readJsonFiles(fileList);
  const { files: fileTokens, warnings } = fromUploads(uploads);

  // Surface parse-time warnings (unsupported $type, malformed values) so the
  // user sees them on Step 1 — they won't otherwise show until Step 3.
  for (const w of warnings) {
    appendLog(`${w.file} · ${w.path} — ${w.reason}`, "err");
  }
  for (const f of parseFailures) {
    appendLog(`${f.path} — ${f.reason}`, "err");
  }

  const out: FileMeta[] = fileTokens.map((ft) => {
    const parts = ft.file.split("/");
    const name = parts[parts.length - 1]!;
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    return {
      path: ft.file,
      name,
      folder,
      tokens: ft.tokens,
      selected: true,
    };
  });

  out.sort((a, b) => (a.folder + a.name).localeCompare(b.folder + b.name));
  setState({ files: out });
}

// ----- import flow -----

function startImport(): void {
  const plan = computePlan();
  if (plan.variables.length === 0) {
    appendLog("No tokens to import.", "err");
    setState({
      step: 4,
      importing: false,
      done: true,
      progress: 0,
      result: { created: 0, updated: 0, errors: [] },
    });
    return;
  }
  clearLog();
  setState({
    step: 4,
    importing: true,
    done: false,
    progress: 0,
    log: [{ text: `Sending ${plan.variables.length} variables to Figma…`, tone: "dim" }],
  });
  postCode({ type: "applyPlan", plan });
}

function postCode(msg: ToCode): void {
  transport.postCode(msg);
}

transport.addMessageListener((msg) => {
  if (msg.type === "progress") {
    appendLog(msg.line, msg.tone);
    setState({ progress: msg.pct });
  } else if (msg.type === "done") {
    const ERROR_PREVIEW = 12;
    for (const err of msg.errors.slice(0, ERROR_PREVIEW)) {
      appendLog(`${err.source.file} · ${err.variable} — ${err.reason}`, "err");
    }
    if (msg.errors.length > ERROR_PREVIEW) {
      appendLog(`…and ${msg.errors.length - ERROR_PREVIEW} more`, "err");
    }
    appendLog(
      `✓ Imported ${msg.created} created, ${msg.updated} updated` +
        (msg.errors.length ? ` (${msg.errors.length} errors)` : ""),
      msg.errors.length ? "err" : "ok",
    );
    setState({
      importing: false,
      done: true,
      progress: 100,
      result: {
        created: msg.created,
        updated: msg.updated,
        errors: msg.errors,
      },
    });
  } else if (msg.type === "error") {
    appendLog(`Error: ${msg.message}`, "err");
    setState({ importing: false, done: true });
  }
  // `settings` messages are handled by createPostMessageStorage.
});

// ----- rendering -----

function render(): void {
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

function renderTitleBar(): HTMLElement {
  const bar = el("div", "titlebar");
  bar.innerHTML = `
    <div class="logo">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 8 14l5-2.5M3 8 8 10.5 13 8M8 2 3 4.5 8 7l5-2.5L8 2Z"/></svg>
    </div>
    <div class="title">Tokens → Variables</div>
    <div class="badge">W3C DTCG</div>
    <div class="spacer"></div>
    <button class="iconbtn" id="settingsBtn" title="Settings">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2"/><path d="M13.4 9.6 14.7 11l-1.3 2.2-1.7-.3a5.4 5.4 0 0 1-1.5.9L9.8 15.5H6.2l-.4-1.7a5.4 5.4 0 0 1-1.5-.9l-1.7.3L1.3 11l1.3-1.4a5.4 5.4 0 0 1 0-3.2L1.3 5 2.6 2.8l1.7.3a5.4 5.4 0 0 1 1.5-.9L6.2.5h3.6l.4 1.7a5.4 5.4 0 0 1 1.5.9l1.7-.3L14.7 5l-1.3 1.4a5.4 5.4 0 0 1 0 3.2Z"/></svg>
    </button>
    <button class="iconbtn" id="closeBtn" title="Close">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>
    </button>
  `;
  bar.querySelector<HTMLButtonElement>("#settingsBtn")!.onclick = () =>
    setState({ settingsOpen: true });
  bar.querySelector<HTMLButtonElement>("#closeBtn")!.onclick = () =>
    postCode({ type: "close" });
  return bar;
}

function renderStepper(): HTMLElement {
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

// ----- step 1: source/upload -----

function renderStep1(): HTMLElement {
  const wrap = el("div", "step-pad");
  wrap.innerHTML = `
    <div class="h-title">Connect a token source</div>
    <div class="h-sub">Import a folder of W3C Design Token files (DTCG · 2025.10) and map them onto Figma variables.</div>
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
    <div class="secondary">or <span class="link">browse files</span> — nested <span class="mono">.json</span> supported</div>
    <input type="file" id="folderInput" multiple webkitdirectory>
  `;
  const input = drop.querySelector<HTMLInputElement>("#folderInput")!;
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
      <div class="text"><b>${state.files.length} file${state.files.length === 1 ? "" : "s"} detected</b> <span class="dim">— ${totalTokens} tokens</span></div>
    `;
    wrap.appendChild(det);
  }
  return wrap;
}

async function readDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items || []);
  const out: File[] = [];
  const tasks: Promise<void>[] = [];
  for (const it of items) {
    const entry = (it as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.();
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

async function walkEntry(entry: FileSystemEntry, out: File[], prefix = ""): Promise<void> {
  if (entry.isFile) {
    await new Promise<void>((res) => {
      (entry as FileSystemFileEntry).file((f) => {
        Object.defineProperty(f, "webkitRelativePath", {
          value: prefix + entry.name,
          configurable: true,
        });
        out.push(f);
        res();
      });
    });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries: FileSystemEntry[] = await new Promise((res) => reader.readEntries(res));
    for (const e of entries) {
      await walkEntry(e, out, prefix + entry.name + "/");
    }
  }
}

// ----- step 2: sets -----

function renderStep2(): HTMLElement {
  const wrap = el("div", "step-pad");
  wrap.innerHTML = `
    <div class="h-title">Select token sets</div>
    <div class="h-sub">Files in <span class="mono">core/</span> become Primitives, <span class="mono">semantic/</span> Semantic, <span class="mono">components/</span> Components. Sibling files with matching shape become modes.</div>
  `;
  const groups = new Map<string, FileMeta[]>();
  for (const f of state.files) {
    const list = groups.get(f.folder) ?? [];
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

// ----- step 3: preview -----

const PREVIEW_PER_COLLECTION = 100;

function renderStep3(): HTMLElement {
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

  const byCollection = new Map<CollectionName, VariableOp[]>();
  for (const v of plan.variables) {
    const list = byCollection.get(v.collection) ?? [];
    list.push(v);
    byCollection.set(v.collection, list);
  }

  for (const cplan of plan.collections) {
    const vars = byCollection.get(cplan.name) ?? [];
    const col = el("div", "collection");
    const modeChips = cplan.modes
      .map((m) => `<span class="mode-chip">${escapeHtml(m)}</span>`)
      .join("");
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
      ln.textContent = `${pw.file} · ${pw.path} — ${pw.reason}`;
      w.appendChild(ln);
    }
    if (plan.warnings.length > 8) {
      const more = el("div", "warning-ln");
      more.textContent = `…and ${plan.warnings.length - 8} more`;
      w.appendChild(more);
    }
    wrap.appendChild(w);
  }
  return wrap;
}

function renderVarRow(v: VariableOp, showModeTags: boolean): HTMLElement {
  const row = el("div", "var-row");
  row.appendChild(renderRowIcon(v.resolvedType, v.values[0]?.value));
  row.appendChild(el("div", "n mono", v.name));
  row.appendChild(el("div", "spacer"));

  const val = el("div", "v mono");
  for (let i = 0; i < v.values.length; i++) {
    if (i > 0) val.appendChild(document.createTextNode(" · "));
    renderModeValue(val, v.values[i]!, v.resolvedType, showModeTags);
  }
  row.appendChild(val);
  return row;
}

function renderRowIcon(
  type: "COLOR" | "FLOAT",
  sample: ValueSpec | undefined,
): HTMLElement {
  if (type === "COLOR" && sample?.kind === "literal") {
    const s = el("span", "swatch");
    s.style.background = String(sample.value);
    return s;
  }
  if (sample?.kind === "alias") return el("span", "hash", "→");
  return el("span", "hash", "#");
}

function renderModeValue(
  into: HTMLElement,
  mv: ModeValue,
  type: "COLOR" | "FLOAT",
  showModeTag: boolean,
): void {
  if (showModeTag) into.appendChild(el("span", "mode-tag", mv.mode));
  if (mv.value.kind === "alias") {
    into.appendChild(el("span", "alias-ref", `→ ${mv.value.targetName}`));
    return;
  }
  if (type === "COLOR") {
    const sm = el("span", "swatch-sm");
    sm.style.background = String(mv.value.value);
    into.appendChild(sm);
  }
  into.appendChild(document.createTextNode(String(mv.value.value)));
}

// ----- step 4: import -----

function renderStep4(): HTMLElement {
  const wrap = el("div", "step-pad");

  if (state.importing) {
    const c = el("div", "run-center");
    c.innerHTML = `
      <div class="run-spinner">
        <svg width="46" height="46" viewBox="0 0 46 46" style="animation: spin 0.9s linear infinite;"><circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4"/><circle cx="23" cy="23" r="19" fill="none" stroke="#0d99ff" stroke-width="4" stroke-linecap="round" stroke-dasharray="40 200"/></svg>
      </div>
      <div class="run-title">Creating variables…</div>
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
    const created = state.result?.created ?? 0;
    const updated = state.result?.updated ?? 0;
    const errors = state.result?.errors.length ?? 0;
    const warnings = computePlan().warnings.length;
    stats.innerHTML = `
      <div class="cell"><div class="big" style="color:#3dd07e">${created}</div><div class="lbl">variables<br/>created</div></div>
      <div class="cell"><div class="big" style="color:#5cb8ff">${updated}</div><div class="lbl">variables<br/>updated</div></div>
      <div class="cell"><div class="big" style="color:${errors ? '#ff8b8b' : '#6b6b6b'}">${errors}</div><div class="lbl">errors<br/>skipped</div></div>
      <div class="cell"><div class="big" style="color:#6b6b6b">${warnings}</div><div class="lbl">parse<br/>warnings</div></div>
    `;
    wrap.appendChild(stats);
  }

  wrap.appendChild(el("div", "console-label", "CONSOLE"));
  const con = el("div", "console");
  for (const ln of state.log) {
    const row = el("div", "ln");
    row.style.color = toneColor(ln.tone);
    row.innerHTML = `<span class="arr">›</span><span>${escapeHtml(ln.text)}</span>`;
    con.appendChild(row);
  }
  wrap.appendChild(con);
  return wrap;
}

function toneColor(t: LogTone): string {
  return {
    dim: "#7a7a7a",
    plain: "#c4c4c4",
    accent: "#b9a6ff",
    ok: "#3dd07e",
    err: "#ff8b8b",
  }[t];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ----- footer -----

function renderFooter(): HTMLElement {
  const bar = el("div", "footer");

  if (state.step < 4) {
    if (state.step === 2 || state.step === 3) {
      const back = el("button", "btn", "Back") as HTMLButtonElement;
      back.onclick = () => setState({ step: (state.step - 1) as Step });
      bar.appendChild(back);
    }
    bar.appendChild(el("div", "spacer"));

    if (state.step === 2) {
      const sc = el("span", "selcount", `${selectedFiles().length} sets selected`);
      bar.appendChild(sc);
    }

    const primary = el("button", "btn primary") as HTMLButtonElement;
    let label = "Continue";
    let disabled = false;
    let onclick: () => void = () => {};
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
    bar.appendChild(el("div", "info", "Importing… please keep the plugin open"));
    bar.appendChild(el("div", "spacer"));
  } else if (state.done) {
    const again = el("button", "btn", "Import another") as HTMLButtonElement;
    again.onclick = () =>
      setState({
        step: 1,
        files: [],
        done: false,
        importing: false,
        progress: 0,
        log: [],
        result: undefined,
      });
    bar.appendChild(again);
    bar.appendChild(el("div", "spacer"));
    const close = el("button", "btn primary", "Close") as HTMLButtonElement;
    close.onclick = () => postCode({ type: "close" });
    bar.appendChild(close);
  }
  return bar;
}

// ----- settings sheet -----

function renderSettingsSheet(): HTMLElement {
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
  head.querySelector<HTMLButtonElement>("#sheetClose")!.onclick = () =>
    setState({ settingsOpen: false });
  sheet.appendChild(head);

  const body = el("div", "sheet-body scroll");

  body.appendChild(
    settingsRow(
      "Reference handling",
      "How to treat alias values like {color.blue.500}.",
      segmented(
        [
          { id: "keepAlias", label: "Keep as alias" },
          { id: "resolve", label: "Resolve to raw value" },
        ],
        settingsStore.get().refMode,
        (id) => {
          settingsStore.update({
            refMode: id as MappingSettings["refMode"],
          });
        },
      ),
    ),
  );

  body.appendChild(
    settingsRow(
      "Group separator",
      "Variable name segments are joined with this character.",
      segmented(
        [
          { id: "slash", label: "/  Slash" },
          { id: "dot", label: ".  Dot" },
        ],
        settingsStore.get().separator,
        (id) => {
          settingsStore.update({
            separator: id as MappingSettings["separator"],
          });
        },
      ),
    ),
  );

  body.appendChild(
    settingsRow(
      "Update existing variables",
      "Match by (collection, name) and overwrite values in place. When off, re-imports leave existing variables untouched.",
      toggle(settingsStore.get().updateExisting, (v) => {
        settingsStore.update({ updateExisting: v });
      }),
    ),
  );

  const themedGroups = computePlan().themeGroups.filter(
    (g): g is Extract<ThemeGroup, { kind: "themed" }> => g.kind === "themed",
  );
  if (themedGroups.length > 0) {
    const tBlock = el("div", "theme-block");
    tBlock.appendChild(el("div", "settings-h", "Themes detected"));
    tBlock.appendChild(
      el(
        "div",
        "settings-sub",
        "Sibling files with matching shape are folded into modes of one collection.",
      ),
    );
    for (const g of themedGroups) {
      const row = el("div", "theme-row");
      const head = el("div", "theme-row-head");
      head.innerHTML = `<span class="theme-collection">${escapeHtml(g.collection)}</span> <span class="theme-dir mono">${escapeHtml(g.dir || "(root)")}/</span>`;
      row.appendChild(head);
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

function settingsRow(title: string, sub: string, control: HTMLElement): HTMLElement {
  const row = el("div", "settings-row");
  const meta = el("div", "settings-meta");
  meta.appendChild(el("div", "settings-h", title));
  meta.appendChild(el("div", "settings-sub", sub));
  row.appendChild(meta);
  row.appendChild(control);
  return row;
}

function segmented(
  options: { id: string; label: string }[],
  current: string,
  onChange: (id: string) => void,
): HTMLElement {
  const seg = el("div", "seg-settings");
  for (const o of options) {
    const b = el("button", "seg-btn" + (o.id === current ? " active" : ""), o.label) as HTMLButtonElement;
    b.onclick = () => onChange(o.id);
    seg.appendChild(b);
  }
  return seg;
}

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrap = el("button", "toggle" + (on ? " on" : "")) as HTMLButtonElement;
  wrap.innerHTML = `<span class="knob"></span>`;
  wrap.onclick = () => onChange(!on);
  return wrap;
}

// ----- DOM helpers -----

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

render();
