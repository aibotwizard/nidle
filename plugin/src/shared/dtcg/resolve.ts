import { aliasPath, isAliasValue } from "./parse.js";
import type { ParseWarning, Token } from "./types.js";

export type ResolveMode = "keepAlias" | "resolve";

/** Either a literal value or an unresolved alias pointing at another token. */
export type ResolvedValue =
  | { kind: "literal"; value: string | number }
  | { kind: "alias"; targetName: string };

export type ResolvedToken = {
  name: string;
  type: Token["type"];
  file: string;
  value: ResolvedValue;
};

export type ResolveResult = {
  tokens: ResolvedToken[];
  warnings: ParseWarning[];
};

/**
 * Resolve `{a.b.c}` alias references across the parsed token set.
 *
 * - `keepAlias`: each alias-valued token becomes `{kind:'alias', targetName}`.
 *   The chain is walked transitively to find the literal-producing target,
 *   so a chain `a → b → c` resolves to a single alias on `c`. This matches
 *   Figma's variable-alias model (one alias edge per mode, never a chain).
 * - `resolve`: the alias is fully substituted with the target's literal value.
 *
 * Cycles, missing targets, and pointing at a non-token are all reported as
 * warnings and the offending token is dropped from the output.
 */
export function resolveTokens(
  tokens: Token[],
  mode: ResolveMode,
): ResolveResult {
  const byName = new Map<string, Token>();
  for (const t of tokens) byName.set(t.name, t);

  const warnings: ParseWarning[] = [];
  const out: ResolvedToken[] = [];

  for (const t of tokens) {
    if (!isAliasValue(t.value)) {
      out.push({
        name: t.name,
        type: t.type,
        file: t.file,
        value: { kind: "literal", value: t.value },
      });
      continue;
    }

    // Walk the chain to validate it (terminates, no cycles, type matches).
    const trail: string[] = [t.name];
    const seen = new Set<string>([t.name]);
    let cursor: Token | undefined = t;
    let bad: { reason: string } | null = null;

    while (cursor && isAliasValue(cursor.value)) {
      const target = aliasName(cursor.value as string);
      const next = byName.get(target);
      if (!next) {
        bad = {
          reason: `alias "${cursor.value}" → "${target}" does not match any token`,
        };
        break;
      }
      if (seen.has(target)) {
        bad = {
          reason: `alias cycle: ${[...trail, target].join(" → ")}`,
        };
        break;
      }
      trail.push(target);
      seen.add(target);
      cursor = next;
    }

    if (bad || !cursor) {
      warnings.push({
        file: t.file,
        path: t.name,
        reason: bad?.reason ?? "alias did not resolve",
      });
      continue;
    }

    // cursor is the literal-bearing chain tip; the immediate target is the
    // first hop named in t.value itself.
    if (cursor.type !== t.type) {
      warnings.push({
        file: t.file,
        path: t.name,
        reason: `alias target "${cursor.name}" has type ${cursor.type}, expected ${t.type}`,
      });
      continue;
    }

    if (mode === "resolve") {
      out.push({
        name: t.name,
        type: t.type,
        file: t.file,
        value: { kind: "literal", value: cursor.value },
      });
    } else {
      // keepAlias: preserve the *direct* hop so consumers see the author's
      // intent (e.g. button → accent.primary, not button → color.blue.500).
      // Figma supports variable-to-variable aliases at any depth, so chains
      // remain queryable in the variables panel.
      const directTarget = aliasName(t.value as string);
      out.push({
        name: t.name,
        type: t.type,
        file: t.file,
        value: { kind: "alias", targetName: directTarget },
      });
    }
  }

  return { tokens: out, warnings };
}

/** "{color.blue.500}" → "color/blue/500" — DTCG aliases are dot-separated. */
export function aliasName(raw: string): string {
  return aliasPath(raw).split(".").join("/");
}
