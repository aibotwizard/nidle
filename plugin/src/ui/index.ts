import { parseFiles, type UploadedFile } from "../shared/dtcg/parse.js";
import { planForPrimitives, type VariablePlan } from "../shared/mapping/toFigma.js";
import type { Token, ParseWarning } from "../shared/dtcg/types.js";
import type { LogTone, PlanError, ToCode, ToUI } from "../code/messages.js";

type Step = 1 | 2 | 3 | 4;

type FileMeta = {
  path: string;
  name: string;
  folder: string;
  json: unknown;
  tokenCount: number;
  selected: boolean;
};

type LogLine = { text: string; tone: LogTone };

type State = {
  step: Step;
  files: FileMeta[];
  warnings: ParseWarning[];
  importing: boolean;
  done: boolean;
  progress: number;
  log: LogLine[];
  result?: { created: number; errors: PlanError[] };
};

const state: State = {
  step: 1,
  files: [],
  warnings: [],
  importing: false,
  done: false,
  progress: 0,
  log: [],
};

// ----- helpers -----

const $ = (id: string) => document.getElementById(id)!;

function setState(patch: Partial<State>): void {
  Object.assign(state, patch);
  render();
}

function appendLog(text: string, tone: LogTone): void {
  state.log = [...state.log, { text, tone }];
}

function selectedFiles(): FileMeta[] {
  return state.files.filter((f) => f.selected);
}

function computePlan(): VariablePlan {
  const uploads: UploadedFile[] = selectedFiles().map((f) => ({
    path: f.path,
    json: f.json,
  }));
  const { tokens } = parseFiles(uploads);
  return planForPrimitives(tokens);
}

function tokensFromFile(json: unknown): { tokens: Token[]; warnings: ParseWarning[] } {
  return parseFiles([{ path: "_", json }]);
}

// ----- upload handling -----

async function handleFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList).filter((f) => f.name.endsWith(".json"));
  const out: FileMeta[] = [];
  const warnings: ParseWarning[] = [];

  for (const f of files) {
    const path = relativePath(f);
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch (e) {
      warnings.push({
        file: path,
        path: "(root)",
        reason: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    const parts = path.split("/");
    const name = parts[parts.length - 1]!;
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    const { tokens, warnings: w } = tokensFromFile(json);
    warnings.push(...w.map((x) => ({ ...x, file: path })));
    out.push({
      path,
      name,
      folder,
      json,
      tokenCount: tokens.length,
      selected: true,
    });
  }

  out.sort((a, b) => (a.folder + a.name).localeCompare(b.folder + b.name));
  setState({ files: out, warnings });
}

function relativePath(f: File): string {
  // webkitRelativePath is set when using <input webkitdirectory>.
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (rel && rel.length > 0) {
    const parts = rel.split("/");
    return parts.length > 1 ? parts.slice(1).join("/") : rel;
  }
  return f.name;
}

// ----- import flow -----

function startImport(): void {
  const plan = computePlan();
  if (plan.variables.length === 0) {
    appendLog("No tokens to import.", "err");
    setState({ step: 4, importing: false, done: true, progress: 0, result: { created: 0, errors: [] } });
    return;
  }
  state.log = [];
  appendLog(`Sending ${plan.variables.length} variables to Figma…`, "dim");
  setState({ step: 4, importing: true, done: false, progress: 0 });
  postCode({ type: "applyPlan", plan });
}

function postCode(msg: ToCode): void {
  parent.postMessage({ pluginMessage: msg }, "*");
}

window.addEventListener("message", (e) => {
  const msg = (e.data && e.data.pluginMessage) as ToUI | undefined;
  if (!msg) return;
  if (msg.type === "progress") {
    appendLog(msg.line, msg.tone);
    setState({ progress: msg.pct });
  } else if (msg.type === "done") {
    appendLog(
      `✓ Imported ${msg.created} variables` +
        (msg.errors.length ? ` (${msg.errors.length} errors)` : ""),
      msg.errors.length ? "err" : "ok",
    );
    setState({
      importing: false,
      done: true,
      progress: 100,
      result: { created: msg.created, errors: msg.errors },
    });
  } else if (msg.type === "error") {
    appendLog(`Error: ${msg.message}`, "err");
    setState({ importing: false, done: true });
  }
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
    <button class="iconbtn" id="closeBtn" title="Close">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>
    </button>
  `;
  bar.querySelector<HTMLButtonElement>("#closeBtn")!.onclick = () => postCode({ type: "close" });
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
    const totalTokens = state.files.reduce((a, f) => a + f.tokenCount, 0);
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
  // Prefer entries for folder support; fall back to dt.files.
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
        // synthesise webkitRelativePath
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
    <div class="h-sub">Each file becomes part of the Primitives collection.</div>
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
        <div class="count">${f.tokenCount}</div>
      `;
      row.onclick = () => {
        f.selected = !f.selected;
        render();
      };
      list.appendChild(row);
    }
    block.appendChild(list);
    stack.appendChild(block);
  }
  wrap.appendChild(stack);
  return wrap;
}

// ----- step 3: preview -----

function renderStep3(): HTMLElement {
  const wrap = el("div", "step-pad");
  const plan = computePlan();
  const totalVars = plan.variables.length;

  const stats = el("div", "stats");
  stats.innerHTML = `
    <div class="stat"><div class="n">${totalVars}</div><div class="l">Variables</div></div>
    <div class="stat"><div class="n">1</div><div class="l">Collections</div></div>
    <div class="stat"><div class="n">1</div><div class="l">Modes</div></div>
    <div class="stat"><div class="n">${selectedFiles().length}</div><div class="l">Files</div></div>
  `;
  wrap.appendChild(stats);

  const col = el("div", "collection");
  col.innerHTML = `
    <div class="collection-head">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#9a9a9a" stroke-width="1.4"><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.2"/><path d="M8 2.4v11.2M2.4 8h11.2"/></svg>
      <span class="n">Primitives</span>
      <div class="spacer"></div>
      <span class="modes">1 mode</span>
      <span class="count">${totalVars}</span>
    </div>
  `;
  const list = el("div");
  for (const v of plan.variables.slice(0, 200)) {
    const row = el("div", "var-row");
    if (v.resolvedType === "COLOR") {
      const s = el("span", "swatch");
      s.style.background = String(v.value);
      row.appendChild(s);
    } else {
      row.appendChild(el("span", "hash", "#"));
    }
    const n = el("div", "n mono", v.name);
    row.appendChild(n);
    row.appendChild(el("div", "spacer"));
    const val = el("div", "v mono");
    if (v.resolvedType === "COLOR") {
      const sm = el("span", "swatch-sm");
      sm.style.background = String(v.value);
      val.appendChild(sm);
    }
    val.appendChild(document.createTextNode(String(v.value)));
    row.appendChild(val);
    list.appendChild(row);
  }
  col.appendChild(list);
  wrap.appendChild(col);

  if (totalVars > 200) {
    const note = el("div", "h-sub");
    note.style.marginTop = "4px";
    note.textContent = `Showing first 200 of ${totalVars}. All will be imported.`;
    wrap.appendChild(note);
  }
  return wrap;
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
    const errors = state.result?.errors.length ?? 0;
    stats.innerHTML = `
      <div class="cell"><div class="big" style="color:#3dd07e">${created}</div><div class="lbl">variables<br/>created</div></div>
      <div class="cell"><div class="big">1</div><div class="lbl">collection<br/>updated</div></div>
      <div class="cell"><div class="big" style="color:${errors ? '#ff8b8b' : '#6b6b6b'}">${errors}</div><div class="lbl">errors<br/>skipped</div></div>
      <div class="cell"><div class="big" style="color:#6b6b6b">${state.warnings.length}</div><div class="lbl">parse<br/>warnings</div></div>
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
      const plan = computePlan();
      label = `Import ${plan.variables.length} variables`;
      disabled = plan.variables.length === 0;
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
        warnings: [],
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

// ----- boot -----

render();
