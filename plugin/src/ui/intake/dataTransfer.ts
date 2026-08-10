/**
 * Drag-and-drop folder traversal. `webkitGetAsEntry` is the only API
 * that exposes dropped directories; files get their relative path
 * grafted onto `webkitRelativePath` so the reader treats drops and
 * picker uploads identically.
 */
export async function readDataTransfer(dt: DataTransfer): Promise<File[]> {
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
