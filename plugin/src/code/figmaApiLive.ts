import type { CollectionName } from "../shared/mapping/toFigma.js";
import type {
  ExistingCollection,
  ExistingVariable,
  FigmaApi,
  FigmaValue,
  FigmaVarType,
  VariableHandle,
} from "../shared/writer/types.js";

/**
 * Live FigmaApi adapter. The only file in the project that calls
 * `figma.variables.*` — keeping the dependency contained to one module
 * satisfies ADR-0001's "only code inside applyPlan may call
 * `figma.variables.*`".
 *
 * Holds live `Variable` and `VariableCollection` instances in id-keyed
 * caches. Reference token plugins (Tokens Studio, Oxide) all write
 * values through the `Variable` instance returned by `createVariable`
 * rather than re-looking-up by id — the sync `getLocalVariables()` is
 * unreliable under dynamic-page mode and a missed lookup turns into a
 * silent no-op that leaves the variable at its COLOR default (white).
 *
 * The factory is async because the seed read uses the new
 * `getLocalVariablesAsync` / `getLocalVariableCollectionsAsync`, which
 * is the only sanctioned way to read variables since the dynamic-page
 * rollout (manifest `documentAccess: "dynamic-page"`).
 */
export async function createFigmaApiLive(): Promise<FigmaApi> {
  const collectionById = new Map<string, VariableCollection>();
  const variableById = new Map<string, Variable>();

  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) {
    collectionById.set(c.id, c);
  }
  for (const v of await figma.variables.getLocalVariablesAsync()) {
    variableById.set(v.id, v);
  }

  const mustCollection = (id: string): VariableCollection => {
    const c = collectionById.get(id);
    if (!c) throw new Error(`collection ${id} not in cache`);
    return c;
  };
  const mustVariable = (id: string): Variable => {
    const v = variableById.get(id);
    if (!v) throw new Error(`variable ${id} not in cache`);
    return v;
  };

  const toFigmaValue = (value: FigmaValue): VariableValue => {
    if (typeof value === "number") return value;
    if ("kind" in value) {
      const target = mustVariable(value.variableHandle.id);
      return figma.variables.createVariableAlias(target);
    }
    return value;
  };

  return {
    listCollections: () =>
      [...collectionById.values()].map(toExistingCollection),
    createCollection: (name) => {
      const c = figma.variables.createVariableCollection(name);
      collectionById.set(c.id, c);
      return toExistingCollection(c);
    },
    renameMode: (collectionId, modeId, name) =>
      mustCollection(collectionId).renameMode(modeId, name),
    addMode: (collectionId, name) =>
      mustCollection(collectionId).addMode(name),
    listVariables: () => [...variableById.values()].map(toExistingVariable),
    createVariable: (name, collectionId, type: FigmaVarType): VariableHandle => {
      const c = mustCollection(collectionId);
      const v = figma.variables.createVariable(name, c, type);
      variableById.set(v.id, v);
      return { id: v.id, name: v.name, collectionId: v.variableCollectionId };
    },
    setValueForMode: (variableId, modeId, value: FigmaValue) => {
      const v = mustVariable(variableId);
      const figmaValue = toFigmaValue(value);
      v.setValueForMode(modeId, figmaValue);
      // One-shot readback for the first few writes: if Figma silently
      // rejected the write (wrong shape, wrong type, wrong modeId), the
      // variable's `valuesByMode` still reports its prior value and we
      // surface that as an error instead of leaving the user staring at
      // a panel full of mysterious whites.
      if (verifyCount-- > 0) {
        const after = v.valuesByMode[modeId];
        if (!sameVariableValue(after, figmaValue)) {
          throw new Error(
            `setValueForMode readback mismatch on "${v.name}" mode ${modeId}: ` +
              `set ${JSON.stringify(figmaValue)} but valuesByMode reports ${JSON.stringify(after)}`,
          );
        }
      }
    },
  };
}

/** How many setValueForMode calls verify-readback. Cheap; only diagnostic. */
let verifyCount = 8;

function sameVariableValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    const av = ao[k];
    const bv = bo[k];
    if (typeof av === "number" && typeof bv === "number") {
      if (Math.abs(av - bv) > 1e-6) return false;
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}

function toExistingCollection(c: VariableCollection): ExistingCollection {
  return {
    handle: { id: c.id, name: c.name as CollectionName },
    defaultModeId: c.defaultModeId,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
  };
}

function toExistingVariable(v: Variable): ExistingVariable {
  return {
    handle: { id: v.id, name: v.name, collectionId: v.variableCollectionId },
  };
}
