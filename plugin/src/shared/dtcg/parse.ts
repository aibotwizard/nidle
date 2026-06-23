import type {
  DtcgGroup,
  DtcgLeaf,
  DtcgType,
  ParseResult,
  Token,
} from "./types.js";

const SUPPORTED_TYPES: ReadonlySet<DtcgType> = new Set([
  "color",
  "dimension",
  "number",
]);

function isLeaf(node: unknown): node is DtcgLeaf {
  return (
    !!node &&
    typeof node === "object" &&
    "$value" in (node as object) &&
    "$type" in (node as object)
  );
}

function isGroup(node: unknown): node is DtcgGroup {
  return !!node && typeof node === "object" && !Array.isArray(node);
}

export type UploadedFile = {
  /** Relative path from the upload root, e.g. "core/color.json". */
  path: string;
  /** Parsed JSON contents. */
  json: unknown;
};

export function parseFiles(files: UploadedFile[]): ParseResult {
  const tokens: Token[] = [];
  const warnings: ParseResult["warnings"] = [];

  for (const f of files) {
    if (!isGroup(f.json)) {
      warnings.push({
        file: f.path,
        path: "(root)",
        reason: "file root is not a JSON object",
      });
      continue;
    }
    walk(f.json, [], f.path, tokens, warnings);
  }

  return { tokens, warnings };
}

function walk(
  node: DtcgGroup,
  trail: string[],
  file: string,
  out: Token[],
  warnings: ParseResult["warnings"],
): void {
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    const nextTrail = [...trail, key];
    if (isLeaf(child)) {
      const t = child.$type as DtcgType;
      if (!SUPPORTED_TYPES.has(t)) {
        warnings.push({
          file,
          path: nextTrail.join("/"),
          reason: `unsupported $type "${child.$type}" (MVP supports color, dimension, number)`,
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

function normalizeValue(
  type: DtcgType,
  raw: unknown,
  file: string,
  trail: string[],
  warnings: ParseResult["warnings"],
): string | number | null {
  if (type === "color") {
    if (typeof raw !== "string") {
      warnings.push({
        file,
        path: trail.join("/"),
        reason: "color value must be a string (e.g. \"#0d99ff\")",
      });
      return null;
    }
    return raw;
  }
  if (type === "dimension") {
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) return n;
    }
    warnings.push({
      file,
      path: trail.join("/"),
      reason: "dimension value must be a number or numeric string",
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
      reason: "number value must be numeric",
    });
    return null;
  }
  return null;
}

/** Parse a hex color (#rgb, #rrggbb, #rrggbbaa) into Figma's {r,g,b,a} 0–1 floats. */
export function hexToRgba(hex: string): {
  r: number;
  g: number;
  b: number;
  a: number;
} | null {
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}
