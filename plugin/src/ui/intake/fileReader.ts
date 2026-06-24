import type { RawUpload } from "../../shared/intake/types.js";

export type FileReadResult = {
  uploads: RawUpload[];
  parseFailures: { path: string; reason: string }[];
};

/**
 * Convert browser `File` objects into `RawUpload[]` for the shared
 * TokenIntake. JSON parse errors are captured per-file rather than
 * thrown, so a single bad file doesn't tank the whole upload.
 */
export async function readJsonFiles(
  files: FileList | File[],
): Promise<FileReadResult> {
  const jsonFiles = Array.from(files).filter((f) => f.name.endsWith(".json"));
  const texts = await Promise.all(jsonFiles.map((f) => f.text()));

  const uploads: RawUpload[] = [];
  const parseFailures: FileReadResult["parseFailures"] = [];
  for (let i = 0; i < jsonFiles.length; i++) {
    const path = relativePath(jsonFiles[i]!);
    try {
      uploads.push({ path, json: JSON.parse(texts[i]!) });
    } catch (e) {
      parseFailures.push({
        path,
        reason: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return { uploads, parseFailures };
}

function relativePath(f: File): string {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (rel && rel.length > 0) {
    const parts = rel.split("/");
    return parts.length > 1 ? parts.slice(1).join("/") : rel;
  }
  return f.name;
}
