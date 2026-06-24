import { parseColor } from "../dtcg/parse.js";
import type { ValueSpec, VariableOp } from "../mapping/toFigma.js";
import type { FigmaValue, VariableHandle } from "./types.js";

/**
 * Translate a plan `ValueSpec` into a value the FigmaApi accepts.
 *
 * - alias  → `{kind:'alias', variableHandle}` once the target is in scope.
 * - color  → `{r,g,b,a}` 0–1 floats from a hex or rgb()/rgba() string.
 * - number → unchanged.
 *
 * Returns `null` when coercion is impossible (missing alias target, bad
 * hex, type mismatch). The caller turns that into a per-token WriteError.
 */
export function coerceValue(
  op: VariableOp,
  spec: ValueSpec,
  varByKey: Map<string, VariableHandle>,
): FigmaValue | null {
  if (spec.kind === "alias") {
    const target = varByKey.get(`${spec.targetCollection}::${spec.targetName}`);
    if (!target) return null;
    return { kind: "alias", variableHandle: target };
  }
  if (op.resolvedType === "COLOR") {
    if (typeof spec.value !== "string") return null;
    return parseColor(spec.value);
  }
  return typeof spec.value === "number" ? spec.value : null;
}
