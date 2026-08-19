import type { VariablePlan } from "../mapping/toFigma.js";
import { setupCollections } from "./setupCollections.js";
import { upsertVariables } from "./upsertVariables.js";
import { writeValues } from "./writeValues.js";
import type {
  FigmaApi,
  LogTone,
  WriteOptions,
  WriteReport,
} from "./types.js";

/**
 * Apply a VariablePlan through a FigmaApi adapter. Three steps:
 *
 *   1. setupCollections — collections, modes, idempotent rename.
 *   2. upsertVariables  — variables exist with the right type.
 *   3. writeValues      — values written per mode, with coercion.
 *
 * Each step is a separate module. The writer here only orchestrates.
 */
export async function write(
  plan: VariablePlan,
  api: FigmaApi,
  opts: WriteOptions = {},
): Promise<WriteReport> {
  const raw = opts.onProgress ?? (() => {});

  // Single owner of the progress scale (req-0003 / FR-805). Callees
  // report their LOCAL 0–100; phases map onto one global, monotonic
  // scale: setup 0–10, value writes 10–100.
  let lastPct = 0;
  const post = (pct: number, line: string, tone: LogTone) => {
    lastPct = Math.max(lastPct, Math.min(100, Math.round(pct)));
    raw({ pct: lastPct, line, tone });
  };

  post(
    0,
    `Preparing ${plan.variables.length} variables across ${plan.collections.length} collection${plan.collections.length === 1 ? "" : "s"}…`,
    "dim",
  );

  const collections = setupCollections(plan, api, (p) =>
    post(p.pct * 0.1, p.line, p.tone),
  );
  const { varByKey, created, updated, errors: upsertErrors } = upsertVariables(
    plan,
    api,
    collections,
  );
  const writeErrors = await writeValues(
    plan,
    api,
    collections,
    varByKey,
    created,
    updated,
    (p) => post(10 + p.pct * 0.9, p.line, p.tone),
  );

  return {
    created,
    updated,
    errors: [...upsertErrors, ...writeErrors],
  };
}
