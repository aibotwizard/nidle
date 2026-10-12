import { isAliasValue, isNegatedAlias } from "./alias.js";
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
  "text",
]);

/**
 * Tokens Studio numeric `$type` names, folded into the DTCG `dimension`
 * grammar (ADR-0015). Values that don't fit the grammar (`%`, `auto`)
 * still warn and drop under D-4. Composite and string TS types
 * (`boxShadow`, `typography`, `text`, `fontFamilies`) stay unsupported.
 */
const TOKENS_STUDIO_DIMENSION_TYPES: ReadonlySet<string> = new Set([
  "spacing",
  "sizing",
  "borderRadius",
  "borderWidth",
  "fontSizes",
  "fontWeights",
  "lineHeights",
  "letterSpacing",
]);

/** Tokens Studio string-valued `$type` names, folded into `text` and
 *  emitted as Figma STRING variables (ADR-0016). */
const TOKENS_STUDIO_STRING_TYPES: ReadonlySet<string> = new Set([
  "text",
  "fontFamilies",
  "textDecoration",
  "other",
]);

/**
 * DTCG scalar types whose value is a string, folded into `text` → Figma
 * STRING (ADR-0019). `fontStyle` is not a DTCG type but real exports use
 * it for text-decoration keywords.
 */
const DTCG_STRING_TYPES: ReadonlySet<string> = new Set([
  "fontFamily",
  "fontStyle",
  "strokeStyle",
  "cubicBezier",
]);

/**
 * DTCG scalar types that are numeric but not lengths, folded into
 * `number` → Figma FLOAT (ADR-0019). Each has its own grammar below:
 * `fontWeight` also accepts the spec's keyword table, `duration` is
 * stored in milliseconds.
 */
const DTCG_NUMBER_TYPES: ReadonlySet<string> = new Set([
  "fontWeight",
  "duration",
]);

/**
 * DTCG composite types, and the sub-token each member becomes (ADR-0021).
 * Figma variables are scalars — `COLOR | FLOAT | STRING | BOOLEAN`, one
 * value per mode — so a composite has no single representation and is
 * split into one variable per member, named after the member key. The
 * members keep their own `$type`, so an alias inside a composite resolves
 * like any other alias and its edge survives.
 */
const COMPOSITE_PARTS: Readonly<Record<string, { key: string; type: string }[]>> = {
  border: [
    { key: "color", type: "color" },
    { key: "width", type: "dimension" },
    { key: "style", type: "strokeStyle" },
  ],
  transition: [
    { key: "duration", type: "duration" },
    { key: "delay", type: "duration" },
    { key: "timingFunction", type: "cubicBezier" },
  ],
};

/** DTCG font-weight keyword table (spec §8.4). */
const FONT_WEIGHT_KEYWORDS: Readonly<Record<string, number>> = {
  thin: 100,
  hairline: 100,
  "extra-light": 200,
  "ultra-light": 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  "semi-bold": 600,
  "demi-bold": 600,
  bold: 700,
  "extra-bold": 800,
  "ultra-bold": 800,
  black: 900,
  heavy: 900,
  "extra-black": 950,
  "ultra-black": 950,
};

/** A node is a token as soon as it carries `$value`; `$type` may be
 *  inherited from an ancestor group (DTCG §5.2.2). */
function isLeaf(node: unknown): node is DtcgLeaf {
  return (
    !!node && typeof node === "object" && "$value" in (node as object)
  );
}

/** The `$type` a node declares, if any — raw, so an unsupported name
 *  still reaches the leaf and warns there rather than vanishing. */
function declaredType(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const raw = (node as Record<string, unknown>).$type;
  return raw === undefined ? undefined : String(raw);
}

/** Fold DTCG and Tokens Studio `$type` names onto the internal vocabulary. */
function foldType(declared: string): DtcgType {
  if (TOKENS_STUDIO_DIMENSION_TYPES.has(declared)) return "dimension";
  if (TOKENS_STUDIO_STRING_TYPES.has(declared)) return "text";
  if (DTCG_STRING_TYPES.has(declared)) return "text";
  if (DTCG_NUMBER_TYPES.has(declared)) return "number";
  return declared as DtcgType;
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
    // Tokens Studio writes `$metadata.json` / `$themes.json` sidecars beside
    // the token files. They hold set order and theme wiring, never tokens, so
    // parsing them would only produce noise.
    if (f.path.slice(f.path.lastIndexOf("/") + 1).startsWith("$")) continue;
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
  inherited?: string,
): void {
  // A group's own `$type` becomes the default for everything below it.
  const scopeType = declaredType(node) ?? inherited;
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    const nextTrail = [...trail, key];
    if (isLeaf(child)) {
      const own = declaredType(child);
      if (own === undefined && isAliasValue(child.$value)) {
        // A reference outranks an inherited group `$type` (DTCG §5.2.2):
        // only the resolver can see what the target is.
        out.push({
          name: nextTrail.join("/"),
          type: null,
          value: child.$value,
          file,
        });
        continue;
      }
      const declared = own ?? scopeType;
      if (declared === undefined) {
        warnings.push({
          file,
          path: nextTrail.join("/"),
          reason:
            "no $type on the token or any ancestor group — type cannot be determined",
        });
        continue;
      }
      if (COMPOSITE_PARTS[declared]) {
        expandComposite(declared, child.$value, nextTrail, file, out, warnings);
        continue;
      }
      const t = foldType(declared);
      if (!SUPPORTED_TYPES.has(t)) {
        warnings.push({
          file,
          path: nextTrail.join("/"),
          reason: `unsupported $type "${declared}" (supported: color, dimension, number, text)`,
        });
        continue;
      }
      const value = normalizeValue(
        t,
        declared,
        child.$value,
        file,
        nextTrail,
        warnings,
      );
      if (value === null) continue;
      out.push({ name: nextTrail.join("/"), type: t, value, file });
    } else if (isGroup(child)) {
      walk(child, nextTrail, file, out, warnings, scopeType);
    }
  }
}

/**
 * Split a composite `$value` into one token per member (ADR-0021).
 * `marker/border` → `marker/border/color`, `/width`, `/style`. Member keys
 * are kebab-cased so the emitted names read like the rest of a token set
 * (`timingFunction` → `timing-function`).
 */
function expandComposite(
  declared: string,
  raw: unknown,
  trail: string[],
  file: string,
  out: Token[],
  warnings: ParseResult["warnings"],
): void {
  const parts = COMPOSITE_PARTS[declared]!;
  const path = trail.join("/");
  if (isAliasValue(raw)) {
    // The target's members aren't known until resolve, and there is no
    // composite variable to alias, so this cannot be split.
    warnings.push({
      file,
      path,
      reason: `alias "${raw}" refers to a whole ${declared} token — a composite cannot be aliased, only its members can (D-16)`,
    });
    return;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push({
      file,
      path,
      reason: `${declared} value must be an object with ${parts.map((p) => p.key).join(", ")}`,
    });
    return;
  }
  const obj = raw as Record<string, unknown>;
  const made: string[] = [];
  for (const part of parts) {
    if (obj[part.key] === undefined) {
      warnings.push({
        file,
        path,
        reason: `${declared} has no "${part.key}" — that member becomes no variable`,
      });
      continue;
    }
    const subTrail = [...trail, kebabCase(part.key)];
    const value = normalizeValue(
      foldType(part.type),
      part.type,
      obj[part.key],
      file,
      subTrail,
      warnings,
    );
    if (value === null) continue;
    out.push({
      name: subTrail.join("/"),
      type: foldType(part.type),
      value,
      file,
    });
    made.push(kebabCase(part.key));
  }
  if (made.length === 0) return;
  warnings.push({
    file,
    path,
    reason: `${declared} split into ${made.length} variables (${made.join(", ")}) — Figma has no composite variable type`,
    level: "notice",
    summary: "composite tokens split into one variable per member",
  });
}

/** `timingFunction` → `timing-function`. */
function kebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function normalizeValue(
  type: DtcgType,
  declared: string,
  rawIn: unknown,
  file: string,
  trail: string[],
  warnings: ParseResult["warnings"],
): string | number | null {
  const raw = flattenValueShape(declared, rawIn, file, trail, warnings);

  // DTCG aliases are valid for any type — preserve them as-is so the
  // resolver step can decide whether to keep or substitute them. A negated
  // alias travels the same way: only the resolver can look up the value it
  // negates (D-14).
  if (isAliasValue(raw)) return raw;
  if (isNegatedAlias(raw)) return raw as string;

  // Two `number`-folded types carry their own grammar, so they are handled
  // by declared name rather than by the internal type.
  if (declared === "duration") {
    const ms = durationToMs(raw);
    if (ms !== null) return ms;
    warnings.push({
      file,
      path: trail.join("/"),
      reason:
        "duration value must be a number of ms, a string with unit ms / s, or {value, unit} (ADR-0019)",
    });
    return null;
  }
  if (declared === "fontWeight") {
    const w = fontWeightToNumber(raw);
    if (w !== null) return w;
    warnings.push({
      file,
      path: trail.join("/"),
      reason:
        "font weight must be a number or a DTCG keyword (thin … ultra-black)",
    });
    return null;
  }

  if (type === "text") {
    if (typeof raw !== "string") {
      warnings.push({
        file,
        path: trail.join("/"),
        reason: "text value must be a string or an alias",
      });
      return null;
    }
    return raw;
  }
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
    if (px !== null) {
      // `em` is converted as if it were rem (deviation D-3, ADR-0011);
      // the token is kept, but the conversion is surfaced, not silent.
      if (typeof raw === "string" && /em\s*$/i.test(raw.trim()) && !/rem\s*$/i.test(raw.trim())) {
        warnings.push({
          file,
          path: trail.join("/"),
          reason: `em treated as rem: "${raw}" → ${px}px (1em = 16px, ADR-0011)`,
          level: "notice",
          summary: "em values treated as rem (1em = 16px)",
        });
      }
      // `%` becomes a unitless fraction (150% → 1.5, ADR-0016); the
      // token is kept, but the conversion is surfaced, not silent.
      if (typeof raw === "string" && /%\s*$/.test(raw.trim())) {
        warnings.push({
          file,
          path: trail.join("/"),
          reason: `percent treated as a fraction: "${raw}" → ${px} (ADR-0016)`,
          level: "notice",
          summary: "percent values treated as fractions",
        });
      }
      return px;
    }
    warnings.push({
      file,
      path: trail.join("/"),
      reason:
        "dimension value must be a number or string with unit px / rem / em / unitless (ADR-0011)",
    });
    return null;
  }
  if (type === "number") {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    // Strict grammar, matching dimensionToPx sans unit — parseFloat
    // would silently accept trailing garbage like "12abc" (D-6).
    if (typeof raw === "string" && /^-?\d*\.?\d+$/.test(raw.trim())) {
      return parseFloat(raw);
    }
    // A `%` on a number reads as a fraction, exactly as on a dimension
    // (D-11) — the alternative dropped the token and every alias to it.
    if (typeof raw === "string" && /^-?\d*\.?\d+\s*%$/.test(raw.trim())) {
      const n = parseFloat(raw) / 100;
      warnings.push({
        file,
        path: trail.join("/"),
        reason: `percent treated as a fraction: "${raw}" → ${n} (ADR-0016)`,
        level: "notice",
        summary: "percent values treated as fractions",
      });
      return n;
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

/**
 * Fold the alternative value shapes DTCG 2025.10 allows onto the plain
 * scalar the grammars below expect:
 *
 * - `{value, unit}` (dimension, duration) → `"0.75rem"`, `"175ms"`.
 *   2025.10 made this the canonical dimension spelling; the older string
 *   form stays valid, so one grammar now covers both.
 * - `fontFamily` font stack `["A", "B"]` → `"A"`. Figma STRING variables
 *   hold one value, and an alias inside the stack survives the fold.
 */
function flattenValueShape(
  declared: string,
  raw: unknown,
  file: string,
  trail: string[],
  warnings: ParseResult["warnings"],
): unknown {
  if (declared === "cubicBezier" && Array.isArray(raw)) {
    // [x1, y1, x2, y2] → "cubic-bezier(x1, y1, x2, y2)": one STRING
    // variable, so the token keeps its 1:1 name and stays usable verbatim
    // in CSS (ADR-0021). Four FLOATs would be four invented names, none
    // of them meaningful alone.
    if (raw.length === 4 && raw.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return `cubic-bezier(${raw.join(", ")})`;
    }
    warnings.push({
      file,
      path: trail.join("/"),
      reason: "cubicBezier value must be four finite numbers or an alias",
    });
    return raw;
  }
  if (declared === "fontFamily" && Array.isArray(raw)) {
    if (raw.length === 0) return raw;
    if (raw.length > 1) {
      warnings.push({
        file,
        path: trail.join("/"),
        reason: `font stack flattened to its first family "${String(raw[0])}" — a Figma STRING variable holds one value (D-15)`,
        level: "notice",
        summary: "font stacks flattened to their first family",
      });
    }
    return raw[0];
  }
  return flattenValueUnit(raw);
}

/** `{ value: 0.75, unit: "rem" }` → `"0.75rem"`; anything else unchanged. */
function flattenValueUnit(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as { value?: unknown; unit?: unknown };
  if (typeof o.value !== "number" || typeof o.unit !== "string") return raw;
  return `${o.value}${o.unit}`;
}

/** 1rem = REM_BASE_PX. Figma variables only store px (ADR-0011). */
export const REM_BASE_PX = 16;

/**
 * Coerce a DTCG dimension `$value` into a px number.
 * Accepts: number; "16"; "16px"; "1rem"; "1.5em"; "150%" → 1.5;
 * and the 2025.10 object form `{value: 1, unit: "rem"}`
 * (case-insensitive, optional whitespace between number and unit).
 * Returns null for anything else.
 */
export function dimensionToPx(rawIn: unknown): number | null {
  const raw = flattenValueUnit(rawIn);
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em|%)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "%") return n / 100;
  return unit === "rem" || unit === "em" ? n * REM_BASE_PX : n;
}

/**
 * Coerce a DTCG duration `$value` into milliseconds.
 * Accepts: number (already ms); "175ms"; "0.2s"; `{value, unit}`.
 * Figma FLOAT variables carry no unit, so ms is the stored unit (D-13).
 */
export function durationToMs(rawIn: unknown): number | null {
  const raw = flattenValueUnit(rawIn);
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(-?\d*\.?\d+)\s*(ms|s)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return null;
  return (m[2] ?? "").toLowerCase() === "s" ? n * 1000 : n;
}

/**
 * Coerce a DTCG font weight into its numeric form: a number, a numeric
 * string, or one of the spec's keywords (`bold` → 700).
 */
export function fontWeightToNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
  return FONT_WEIGHT_KEYWORDS[s.toLowerCase()] ?? null;
}
