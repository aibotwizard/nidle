import { expandTokensStudio, parseFiles, type UploadedFile } from "../dtcg/parse.js";
import type { Token } from "../dtcg/types.js";
import type { IntakeResult, RawUpload } from "./types.js";

/**
 * Lift a set of raw uploads into the planner-ready `FileTokens[]` shape.
 *
 * Supports both W3C DTCG multi-file uploads and the Tokens Studio single-file
 * combined format. Tokens Studio files are expanded into virtual per-set files
 * before parsing so aliases resolve correctly.
 *
 * Pure: no DOM, no Figma, no I/O.
 */
export function fromUploads(uploads: RawUpload[]): IntakeResult {
  const figmaUploads: UploadedFile[] = uploads.flatMap((u) =>
    expandTokensStudio({ path: u.path, json: u.json }),
  );
  const { tokens, warnings } = parseFiles(figmaUploads);

  const tokensByFile = new Map<string, Token[]>();
  for (const fu of figmaUploads) tokensByFile.set(fu.path, []);
  for (const t of tokens) tokensByFile.get(t.file)?.push(t);

  const files = figmaUploads.map((fu) => ({
    file: fu.path,
    tokens: tokensByFile.get(fu.path) ?? [],
  }));

  return { files, warnings, parseFailures: [] };
}
