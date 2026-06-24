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

/** A DTCG alias value such as "{color.blue.500}". */
export function isAliasValue(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    raw.length >= 3 &&
    raw.startsWith("{") &&
    raw.endsWith("}")
  );
}

/** Extract the dot-separated path from an alias string `"{a.b.c}"` → `"a.b.c"`. */
export function aliasPath(raw: string): string {
  return raw.slice(1, -1).trim();
}

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

/**
 * Tokens Studio exports a single combined JSON where each top-level key is a
 * named token set (e.g. "core", "SchemeStatic/Light"). Aliases are authored
 * relative to those set names — e.g. `{post.core.color.sandgrey.002}` refers
 * to `post/core/color/sandgrey/002` inside the "core" set, not
 * `core/post/core/color/sandgrey/002` prefixed by the set key.
 *
 * Detected by the presence of `$metadata.tokenSetOrder` or `$themes` at the
 * root. Each set is returned as its own virtual UploadedFile so that
 * parseFiles() produces token names without the set-key prefix.
 *
 * Plain W3C DTCG files (no `$themes`/`$metadata`) are returned unchanged.
 */
export function expandTokensStudio(f: UploadedFile): UploadedFile[] {
  const root = f.json as Record<string, unknown>;
  const isTokensStudio =
    (Array.isArray(root.$themes) && root.$themes.length > 0) ||
    (root.$metadata != null &&
      typeof root.$metadata === "object" &&
      Array.isArray((root.$metadata as Record<string, unknown>).tokenSetOrder));
  if (!isTokensStudio) return [f];

  const meta = root.$metadata as Record<string, unknown> | undefined;
  const setOrder: string[] =
    Array.isArray(meta?.tokenSetOrder)
      ? (meta!.tokenSetOrder as string[])
      : Object.keys(root).filter((k) => !k.startsWith("$"));

  return setOrder
    .filter((key) => key in root && !key.startsWith("$"))
    .map((key) => ({ path: key, json: root[key] }));
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
  // DTCG aliases are valid for any type — preserve them as-is so the
  // resolver step can decide whether to keep or substitute them.
  if (isAliasValue(raw)) return raw;

  if (type === "color") {
    if (typeof raw !== "string") {
      warnings.push({
        file,
        path: trail.join("/"),
        reason: "color value must be a string (e.g. \"#0d99ff\") or an alias",
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
      reason:
        "dimension value must be a number or string with unit px / rem / em / unitless (ADR-0011)",
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
      reason: "number value must be numeric or an alias",
    });
    return null;
  }
  return null;
}

export type Rgba = { r: number; g: number; b: number; a: number };

/** 1rem = REM_BASE_PX. Figma variables only store px (ADR-0011). */
export const REM_BASE_PX = 16;

/**
 * Coerce a DTCG dimension `$value` into a px number.
 * Accepts: number; "16"; "16px"; "1rem"; "1.5em" (case-insensitive, optional
 * whitespace between number and unit). Returns null for anything else.
 */
export function dimensionToPx(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  return unit === "rem" || unit === "em" ? n * REM_BASE_PX : n;
}

/**
 * Parse a CSS color string into Figma's {r,g,b,a} 0–1 floats.
 * Accepts hex (#rgb, #rrggbb, #rrggbbaa) and CSS rgb()/rgba()
 * with comma or whitespace separators. Returns null on anything else.
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim();
  if (s.startsWith("#")) return hexToRgba(s);
  if (/^rgba?\s*\(/i.test(s)) return rgbFuncToRgba(s);
  return null;
}

/** @deprecated use parseColor — kept for tests that exercise hex specifically. */
export const hexToRgba = (hex: string): Rgba | null => {
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
};

function rgbFuncToRgba(s: string): Rgba | null {
  const open = s.indexOf("(");
  const close = s.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  const parts = s
    .slice(open + 1, close)
    .split(/[,\s/]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const ch = parts.slice(0, 3).map(parseChannel);
  if (ch.some((n) => n === null)) return null;
  const a = parts.length === 4 ? parseAlpha(parts[3]!) : 1;
  if (a === null) return null;
  return { r: ch[0]!, g: ch[1]!, b: ch[2]!, a };
}

function parseChannel(p: string): number | null {
  if (p.endsWith("%")) {
    const n = parseFloat(p.slice(0, -1));
    return Number.isFinite(n) ? clamp01(n / 100) : null;
  }
  const n = parseFloat(p);
  return Number.isFinite(n) ? clamp01(n / 255) : null;
}

function parseAlpha(p: string): number | null {
  if (p.endsWith("%")) {
    const n = parseFloat(p.slice(0, -1));
    return Number.isFinite(n) ? clamp01(n / 100) : null;
  }
  const n = parseFloat(p);
  return Number.isFinite(n) ? clamp01(n) : null;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
