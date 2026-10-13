import type { FigmaRgba } from "./types.js";

/**
 * Parse a CSS color string into Figma's {r,g,b,a} 0–1 floats.
 * Accepts hex (#rgb, #rrggbb, #rrggbbaa) and CSS rgb()/rgba()
 * with comma or whitespace separators. Returns null on anything else.
 */
export function parseColor(input: string): FigmaRgba | null {
  const s = input.trim();
  if (s.startsWith("#")) return hexToRgba(s);
  if (/^rgba?\s*\(/i.test(s)) return rgbFuncToRgba(s);
  return null;
}

function hexToRgba(hex: string): FigmaRgba | null {
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

function rgbFuncToRgba(s: string): FigmaRgba | null {
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
