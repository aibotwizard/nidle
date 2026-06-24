import type { VariablePlan } from "../mapping/toFigma.js";
import { setupCollections } from "./setupCollections.js";
import { upsertVariables } from "./upsertVariables.js";
import { writeValues } from "./writeValues.js";
import type {
  FigmaApi,
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
  const onProgress = opts.onProgress ?? (() => {});

  onProgress({
    pct: 0,
    line: `Preparing ${plan.variables.length} variables across ${plan.collections.length} collection${plan.collections.length === 1 ? "" : "s"}…`,
    tone: "dim",
  });

  const collections = setupCollections(plan, api, onProgress);
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
    onProgress,
  );

  return {
    created,
    updated,
    errors: [...upsertErrors, ...writeErrors],
  };
}
