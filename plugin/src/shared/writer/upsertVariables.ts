import type { CollectionName, VariablePlan } from "../mapping/toFigma.js";
import type {
  FigmaApi,
  ResolvedCollection,
  VariableHandle,
  WriteError,
} from "./types.js";

export type UpsertResult = {
  varByKey: Map<string, VariableHandle>;
  created: number;
  updated: number;
  errors: WriteError[];
};

/**
 * Upsert each plan variable by (collection, name) per ADR-0004. Existing
 * variables are reused; missing ones are created. Returns a handle map
 * keyed by `"${collection}::${name}"` for the value-write step.
 */
export function upsertVariables(
  plan: VariablePlan,
  api: FigmaApi,
  collections: Map<CollectionName, ResolvedCollection>,
): UpsertResult {
  const existing = indexExistingVariables(api, collections);

  const varByKey = new Map<string, VariableHandle>();
  const errors: WriteError[] = [];
  let created = 0;
  let updated = 0;

  for (const op of plan.variables) {
    const target = collections.get(op.collection);
    if (!target) {
      errors.push({
        variable: op.name,
        reason: `collection "${op.collection}" not initialised`,
        source: op.source,
      });
      continue;
    }
    const inCollection = existing.get(op.collection)!;
    let v = inCollection.get(op.name);
    if (v) {
      if (op.op === "create") {
        errors.push({
          variable: op.name,
          reason: `variable already exists in "${op.collection}" and "update existing" is off`,
          source: op.source,
        });
        continue;
      }
      updated++;
    } else {
      try {
        v = api.createVariable(op.name, target.handle.id, op.resolvedType);
        inCollection.set(op.name, v);
        created++;
      } catch (e) {
        errors.push({
          variable: op.name,
          reason: e instanceof Error ? e.message : String(e),
          source: op.source,
        });
        continue;
      }
    }
    varByKey.set(`${op.collection}::${op.name}`, v);
  }
  return { varByKey, created, updated, errors };
}

function indexExistingVariables(
  api: FigmaApi,
  collections: Map<CollectionName, ResolvedCollection>,
): Map<CollectionName, Map<string, VariableHandle>> {
  // Single scan of listVariables(), bucketed by collection id — the API
  // returns every variable in the file on each call.
  const idToName = new Map<string, CollectionName>();
  for (const [n, { handle }] of collections.entries()) {
    idToName.set(handle.id, n);
  }
  const out = new Map<CollectionName, Map<string, VariableHandle>>();
  for (const cname of collections.keys()) out.set(cname, new Map());
  for (const v of api.listVariables()) {
    const cname = idToName.get(v.handle.collectionId);
    if (cname) out.get(cname)!.set(v.handle.name, v.handle);
  }
  return out;
}
