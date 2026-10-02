import { aliasPath, isAliasValue, negatedAliasOf } from "./parse.js";
import type { DtcgType, ParseWarning, Token } from "./types.js";

export type ResolveMode = "keepAlias" | "resolve";

/** Either a literal value or an unresolved alias pointing at another token. */
export type ResolvedValue =
  | { kind: "literal"; value: string | number }
  | { kind: "alias"; targetName: string };

export type ResolvedToken = {
  name: string;
  /** Always concrete: an untyped token has taken its target's type. */
  type: DtcgType;
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
    // `-{alias}`: Figma has no computed variables, so the only way to keep
    // the token is to read the target's literal and negate it. The alias
    // edge cannot survive that (D-14), which is why it is surfaced.
    const negated = negatedAliasOf(t.value);
    if (negated !== null) {
      const targetName = aliasName(negated);
      const target = byName.get(targetName);
      if (!target) {
        warnings.push({
          file: t.file,
          path: t.name,
          reason: `negated alias "${t.value}" → "${targetName}" does not match any token`,
        });
        continue;
      }
      const walked = chainTip(target, byName);
      if ("error" in walked) {
        warnings.push({ file: t.file, path: t.name, reason: walked.error });
        continue;
      }
      const literal = walked.tip.value;
      if (typeof literal !== "number") {
        warnings.push({
          file: t.file,
          path: t.name,
          reason: `negated alias "${t.value}" → "${walked.tip.name}" is not numeric, so it cannot be negated`,
        });
        continue;
      }
      out.push({
        name: t.name,
        type: (t.type ?? walked.tip.type)!,
        file: t.file,
        value: { kind: "literal", value: -literal },
      });
      warnings.push({
        file: t.file,
        path: t.name,
        reason: `negated alias "${t.value}" resolved to ${-literal} — Figma cannot negate a reference, so no alias edge is kept (D-14)`,
        level: "notice",
        summary: "negated aliases resolved to negative literals",
      });
      continue;
    }

    if (!isAliasValue(t.value)) {
      out.push({
        name: t.name,
        // Only alias-valued tokens are left untyped by the parser.
        type: t.type!,
        file: t.file,
        value: { kind: "literal", value: t.value },
      });
      continue;
    }

    // Walk the chain to validate it (terminates, no cycles, type matches).
    const walked = chainTip(t, byName);
    if ("error" in walked) {
      warnings.push({ file: t.file, path: t.name, reason: walked.error });
      continue;
    }
    const cursor = walked.tip;

    // cursor is the literal-bearing chain tip; the immediate target is the
    // first hop named in t.value itself. An untyped token declared no
    // expectation to violate, so it skips the match check and simply takes
    // the type of what it points at (DTCG §5.2.2).
    if (t.type !== null && cursor.type !== t.type) {
      warnings.push({
        file: t.file,
        path: t.name,
        reason: `alias target "${cursor.name}" has type ${cursor.type}, expected ${t.type}`,
      });
      continue;
    }
    // The chain tip carries a literal, so its type is never null.
    const type = (t.type ?? cursor.type)!;

    if (mode === "resolve") {
      out.push({
        name: t.name,
        type,
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
        type,
        file: t.file,
        value: { kind: "alias", targetName: directTarget },
      });
    }
  }

  return { tokens: out, warnings };
}

/**
 * Follow alias hops from `start` until a token bearing a literal, which is
 * what validates the chain: it terminates, has no cycle, and its tip is
 * the type every hop must agree with.
 */
function chainTip(
  start: Token,
  byName: Map<string, Token>,
): { tip: Token } | { error: string } {
  const trail: string[] = [start.name];
  const seen = new Set<string>([start.name]);
  let cursor: Token = start;
  while (isAliasValue(cursor.value)) {
    const target = aliasName(cursor.value);
    const next = byName.get(target);
    if (!next) {
      return {
        error: `alias "${cursor.value}" → "${target}" does not match any token`,
      };
    }
    if (seen.has(target)) {
      return { error: `alias cycle: ${[...trail, target].join(" → ")}` };
    }
    trail.push(target);
    seen.add(target);
    cursor = next;
  }
  return { tip: cursor };
}

/** "{color.blue.500}" → "color/blue/500" — DTCG aliases are dot-separated. */
export function aliasName(raw: string): string {
  return aliasPath(raw).split(".").join("/");
}
