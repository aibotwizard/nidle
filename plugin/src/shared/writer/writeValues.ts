import type { CollectionName, VariablePlan } from "../mapping/toFigma.js";
import { coerceValue } from "./coerceValue.js";
import type {
  FigmaApi,
  ResolvedCollection,
  VariableHandle,
  WriteError,
  WriteProgress,
} from "./types.js";

/**
 * Walk the plan a second time, coerce each ModeValue, and call the
 * adapter's `setValueForMode`. Emits a progress event every ~5% and
 * yields to the event loop on the same cadence so figma.ui.postMessage
 * actually reaches the UI mid-import (ADR-0010).
 */
export async function writeValues(
  plan: VariablePlan,
  api: FigmaApi,
  collections: Map<CollectionName, ResolvedCollection>,
  varByKey: Map<string, VariableHandle>,
  created: number,
  updated: number,
  onProgress: (p: WriteProgress) => void,
): Promise<WriteError[]> {
  const errors: WriteError[] = [];
  const total = plan.variables.length;
  let i = 0;
  for (const op of plan.variables) {
    i++;
    const v = varByKey.get(`${op.collection}::${op.name}`);
    const target = collections.get(op.collection);
    if (!v || !target) continue;

    for (const mv of op.values) {
      const modeId = target.modeIds.get(mv.mode);
      if (!modeId) {
        if (!target.skippedModes.has(mv.mode)) {
          errors.push({
            variable: op.name,
            reason: `mode "${mv.mode}" not initialised on "${op.collection}"`,
            source: op.source,
          });
        }
        continue;
      }
      try {
        const value = coerceValue(op, mv.value, varByKey);
        if (value === null) {
          errors.push({
            variable: op.name,
            reason:
              mv.value.kind === "alias"
                ? `alias target "${mv.value.targetCollection}::${mv.value.targetName}" not found`
                : `could not coerce value "${String(mv.value.value)}" to ${op.resolvedType}`,
            source: op.source,
          });
          continue;
        }
        api.setValueForMode(v.id, modeId, value);
      } catch (e) {
        errors.push({
          variable: op.name,
          reason: e instanceof Error ? e.message : String(e),
          source: op.source,
        });
      }
    }

    if (i % Math.max(1, Math.floor(total / 20)) === 0 || i === total) {
      const pct = Math.round((i / total) * 100);
      onProgress({
        pct,
        line: `Wrote ${i}/${total} variables (${created} created, ${updated} updated)`,
        tone: "plain",
      });
      // Yield so postMessage flushes to the UI; the sandbox otherwise
      // batches everything until the whole loop returns.
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
  return errors;
}
