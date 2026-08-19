import type { RawUpload } from "../../shared/intake/types.js";

/**
 * File intake for both browser sources, and the single owner of the
 * upload path contract:
 *
 *   Every `RawUpload.path` is relative to the upload root and never
 *   contains the root itself.
 *
 * How each producer satisfies it (req-0002 / FR-106):
 * - Picker: the browser prefixes `webkitRelativePath` with the chosen
 *   folder's own name — strip exactly that first segment.
 * - Drop of a single directory: that directory IS the root; paths are
 *   relative to its contents.
 * - Drop of multiple items or loose files: the drop surface is the
 *   root; each item keeps its own name as the first path segment.
 *
 * Consequence: dropping folder X and picking folder X produce identical
 * paths, at any directory depth.
 */

export type IntakeFiles = {
  uploads: RawUpload[];
  parseFailures: { path: string; reason: string }[];
};

type PathedFile = { file: File; path: string };

export async function fromPicker(list: FileList | File[]): Promise<IntakeFiles> {
  const pairs: PathedFile[] = Array.from(list).map((f) => {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (rel && rel.length > 0) {
      const parts = rel.split("/");
      if (parts.length > 1) return { file: f, path: parts.slice(1).join("/") };
    }
    return { file: f, path: f.name };
  });
  return parsePairs(pairs);
}

export async function fromDrop(dt: DataTransfer): Promise<IntakeFiles> {
  const entries: FileSystemEntry[] = [];
  const pairs: PathedFile[] = [];
  for (const it of Array.from(dt.items || [])) {
    const entry = (
      it as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }
    ).webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry);
    } else {
      const f = it.getAsFile();
      if (f) pairs.push({ file: f, path: f.name });
    }
  }

  if (entries.length === 1 && entries[0]!.isDirectory) {
    // Single-directory drop: the folder is the root, same as picking it.
    for (const child of await readDir(entries[0] as FileSystemDirectoryEntry)) {
      await walk(child, "", pairs);
    }
  } else {
    for (const e of entries) await walk(e, "", pairs);
  }

  if (pairs.length === 0 && dt.files) {
    // No entries API (older engines): treat as loose files.
    return parsePairs(Array.from(dt.files).map((f) => ({ file: f, path: f.name })));
  }
  return parsePairs(pairs);
}

async function walk(
  entry: FileSystemEntry,
  prefix: string,
  out: PathedFile[],
): Promise<void> {
  if (entry.isFile) {
    const f = await new Promise<File>((res) => (entry as FileSystemFileEntry).file(res));
    out.push({ file: f, path: prefix + entry.name });
  } else if (entry.isDirectory) {
    for (const child of await readDir(entry as FileSystemDirectoryEntry)) {
      await walk(child, prefix + entry.name + "/", out);
    }
  }
}

async function readDir(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  // readEntries delivers results in batches (Chrome caps ~100 per call);
  // drain the reader until it returns an empty batch.
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries(res));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function parsePairs(pairs: PathedFile[]): Promise<IntakeFiles> {
  const json = pairs.filter((p) => p.path.endsWith(".json"));
  const texts = await Promise.all(json.map((p) => p.file.text()));

  const uploads: RawUpload[] = [];
  const parseFailures: IntakeFiles["parseFailures"] = [];
  json.forEach((p, i) => {
    try {
      uploads.push({ path: p.path, json: JSON.parse(texts[i]!) });
    } catch (e) {
      parseFailures.push({
        path: p.path,
        reason: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  });
  return { uploads, parseFailures };
}
