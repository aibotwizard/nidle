/**
 * The DTCG alias grammar — `"{a.b.c}"`, and the `"-{a.b.c}"` negation
 * ADR-0021 admits. Shared by the parse stage (which recognises aliases to
 * defer them) and the resolve stage (which follows them).
 */

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

/** `"-{sizes.8}"` — an alias with arithmetic wrapped around it. */
export function isNegatedAlias(raw: unknown): boolean {
  return typeof raw === "string" && /^-\s*\{.+\}$/.test(raw.trim());
}

/** `"-{sizes.8}"` → `"{sizes.8}"`; null when there is no negation. */
export function negatedAliasOf(raw: unknown): string | null {
  if (!isNegatedAlias(raw)) return null;
  return (raw as string).trim().slice(1).trim();
}

/** "{color.blue.500}" → "color/blue/500" — DTCG aliases are dot-separated. */
export function aliasName(raw: string): string {
  return aliasPath(raw).split(".").join("/");
}
